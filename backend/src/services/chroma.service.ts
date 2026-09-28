import { ChromaClient, Collection } from 'chromadb';
import { DateFilter, RAGSource, TimesheetEntry } from '../types/timesheet.types.js';
import { embeddingService } from './embedding.service.js';

interface InMemoryDoc {
  id: string;
  document: string;
  embedding: number[];
  metadata: {
    jira: string;
    task: string;
    date: string;
    hours: number;
    project: string;
    description: string;
    comment: string;
  };
}

export class ChromaService {
  private client: ChromaClient | null = null;
  private collection: Collection | null = null;
  private readonly collectionName = 'jira-timesheet';
  private chromaUrl: string;

  // In-memory fallback if ChromaDB container is not running
  private inMemoryDocs: InMemoryDoc[] = [];
  private isConnected = false;

  constructor() {
    this.chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
    try {
      this.client = new ChromaClient({ path: this.chromaUrl });
    } catch {
      this.client = null;
    }
  }

  /**
   * Check connection to ChromaDB
   */
  public async checkConnection(): Promise<boolean> {
    try {
      if (!this.client) {
        this.client = new ChromaClient({ path: this.chromaUrl });
      }
      const hb = await this.client.heartbeat();
      this.isConnected = typeof hb === 'number' || !!hb;
      return this.isConnected;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Get or initialize the collection in ChromaDB
   */
  private async getCollection(): Promise<Collection | null> {
    const connected = await this.checkConnection();
    if (!connected || !this.client) {
      return null;
    }

    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { 'hnsw:space': 'cosine' },
      });
      return this.collection;
    } catch {
      return null;
    }
  }

  /**
   * Index timesheet entries into vector database
   */
  public async indexEntries(entries: TimesheetEntry[]): Promise<{
    count: number;
    usedChroma: boolean;
  }> {
    if (entries.length === 0) {
      return { count: 0, usedChroma: false };
    }

    const documents: string[] = [];
    const ids: string[] = [];
    const metadatas: Array<{
      jira: string;
      task: string;
      date: string;
      hours: number;
      project: string;
      description: string;
      comment: string;
    }> = [];

    for (const entry of entries) {
      const doc = embeddingService.formatDocument(entry);
      documents.push(doc);
      ids.push(entry.id);
      metadatas.push({
        jira: entry.jira,
        task: entry.task,
        date: entry.date,
        hours: entry.hours,
        project: entry.project || 'General',
        description: entry.description || '',
        comment: entry.comment || '',
      });
    }

    // Generate embeddings in batches
    const embeddings = await embeddingService.generateBatchEmbeddings(documents);

    // Try ChromaDB first
    const coll = await this.getCollection();
    let usedChroma = false;

    if (coll) {
      try {
        // Reset/delete existing collection before re-indexing
        if (this.client) {
          try {
            await this.client.deleteCollection({ name: this.collectionName });
          } catch {
            // ignore if didn't exist
          }
        }
        const freshCollection = await this.client!.getOrCreateCollection({
          name: this.collectionName,
          metadata: { 'hnsw:space': 'cosine' },
        });
        this.collection = freshCollection;

        // ChromaDB batch insertion
        const batchSize = 100;
        for (let i = 0; i < ids.length; i += batchSize) {
          await freshCollection.add({
            ids: ids.slice(i, i + batchSize),
            embeddings: embeddings.slice(i, i + batchSize),
            documents: documents.slice(i, i + batchSize),
            metadatas: metadatas.slice(i, i + batchSize),
          });
        }
        usedChroma = true;
      } catch (err: unknown) {
        console.warn('Could not write to ChromaDB, using in-memory vector store fallback:', err);
        usedChroma = false;
      }
    }

    // Always maintain in-memory copy as reliable backup and for instant queries
    this.inMemoryDocs = ids.map((id, idx) => ({
      id,
      document: documents[idx],
      embedding: embeddings[idx],
      metadata: metadatas[idx],
    }));

    return { count: entries.length, usedChroma };
  }

  /**
   * Query vector store for top K similar documents with optional metadata filters
   */
  public async query(
    queryEmbedding: number[],
    topK = 5,
    filter?: {
      jira?: string;
      project?: string;
      dateFilter?: DateFilter;
    }
  ): Promise<Array<{ document: string; metadata: any; distance: number; source: RAGSource }>> {
    const coll = await this.getCollection();

    if (coll) {
      try {
        const whereClause = this.buildChromaWhereClause(filter);
        const queryParams: any = {
          queryEmbeddings: [queryEmbedding],
          nResults: topK,
        };

        if (whereClause) {
          queryParams.where = whereClause;
        }

        const results = await coll.query(queryParams);

        if (results && results.documents && results.documents[0] && results.documents[0].length > 0) {
          const docs = results.documents[0];
          const metas = results.metadatas ? results.metadatas[0] : [];
          const distances = results.distances ? results.distances[0] : [];

          return docs.map((doc, idx) => {
            const meta: any = metas[idx] || {};
            const dist = distances[idx] !== null && distances[idx] !== undefined ? distances[idx] : 0;
            return {
              document: doc || '',
              metadata: meta,
              distance: dist,
              source: {
                jira: meta.jira || '',
                task: meta.task || '',
                date: meta.date || '',
                hours: Number(meta.hours || 0),
                project: meta.project,
                description: meta.description,
                comment: meta.comment,
              },
            };
          });
        }
      } catch (err) {
        console.warn('Chroma query failed, falling back to in-memory vector search:', err);
      }
    }

    // Fallback: in-memory cosine similarity search
    return this.queryInMemory(queryEmbedding, topK, filter);
  }

  /**
   * Fast in-memory cosine similarity query
   */
  private queryInMemory(
    queryEmbedding: number[],
    topK = 5,
    filter?: {
      jira?: string;
      project?: string;
      dateFilter?: DateFilter;
    }
  ): Array<{ document: string; metadata: any; distance: number; source: RAGSource }> {
    let candidates = this.inMemoryDocs;

    // Apply metadata filters
    if (filter) {
      if (filter.jira) {
        const j = filter.jira.toUpperCase();
        candidates = candidates.filter((c) => c.metadata.jira.toUpperCase() === j);
      }
      if (filter.project) {
        const p = filter.project.toLowerCase();
        candidates = candidates.filter((c) => c.metadata.project.toLowerCase().includes(p));
      }
      if (filter.dateFilter) {
        if (filter.dateFilter.startDate) {
          candidates = candidates.filter((c) => c.metadata.date >= filter.dateFilter!.startDate!);
        }
        if (filter.dateFilter.endDate) {
          candidates = candidates.filter((c) => c.metadata.date <= filter.dateFilter!.endDate!);
        }
      }
    }

    // Calculate cosine similarity
    const scored = candidates.map((doc) => {
      let dot = 0;
      let normA = 0;
      let normB = 0;
      const emb = doc.embedding;

      for (let i = 0; i < queryEmbedding.length; i++) {
        dot += queryEmbedding[i] * emb[i];
        normA += queryEmbedding[i] * queryEmbedding[i];
        normB += emb[i] * emb[i];
      }

      const sim = normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
      // Cosine distance = 1 - cosine similarity
      const distance = Math.max(0, 1 - sim);

      return {
        doc,
        distance,
      };
    });

    // Sort ascending by distance (descending by similarity)
    scored.sort((a, b) => a.distance - b.distance);

    const topResults = scored.slice(0, topK);

    return topResults.map(({ doc, distance }) => ({
      document: doc.document,
      metadata: doc.metadata,
      distance,
      source: {
        jira: doc.metadata.jira,
        task: doc.metadata.task,
        date: doc.metadata.date,
        hours: doc.metadata.hours,
        project: doc.metadata.project,
        description: doc.metadata.description,
        comment: doc.metadata.comment,
      },
    }));
  }

  /**
   * Helper to build ChromaDB where clause
   */
  private buildChromaWhereClause(filter?: {
    jira?: string;
    project?: string;
    dateFilter?: DateFilter;
  }): any | undefined {
    if (!filter) return undefined;

    const conditions: any[] = [];

    if (filter.jira) {
      conditions.push({ jira: { $eq: filter.jira } });
    }
    if (filter.project) {
      conditions.push({ project: { $eq: filter.project } });
    }
    if (filter.dateFilter?.startDate) {
      conditions.push({ date: { $gte: filter.dateFilter.startDate } });
    }
    if (filter.dateFilter?.endDate) {
      conditions.push({ date: { $lte: filter.dateFilter.endDate } });
    }

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
  }

  /**
   * Get collection count
   */
  public async getCount(): Promise<number> {
    const coll = await this.getCollection();
    if (coll) {
      try {
        return await coll.count();
      } catch {
        return this.inMemoryDocs.length;
      }
    }
    return this.inMemoryDocs.length;
  }

  /**
   * Reset / clear collection
   */
  public async clear(): Promise<void> {
    this.inMemoryDocs = [];
    if (this.client) {
      try {
        await this.client.deleteCollection({ name: this.collectionName });
      } catch {
        // ignore
      }
    }
    this.collection = null;
  }
}

export const chromaService = new ChromaService();
