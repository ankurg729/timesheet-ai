import { OpenAI } from 'openai';
import { TimesheetEntry } from '../types/timesheet.types.js';
import { aiService } from './ai.service.js';

export class EmbeddingService {
  private openai: OpenAI | null = null;
  private embeddingModel: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

    if (apiKey && apiKey.trim() !== '' && !apiKey.includes('your_openai_api_key')) {
      this.openai = new OpenAI({ apiKey: apiKey.trim() });
    }
  }

  /**
   * Check if OpenAI client has a configured API key
   */
  public hasApiKey(): boolean {
    const key = process.env.OPENAI_API_KEY;
    return !!key && key.trim() !== '' && !key.includes('your_openai_api_key');
  }

  /**
   * Reload client if API key changed in runtime or .env
   */
  public refreshClient(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    this.embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    if (apiKey && apiKey.trim() !== '' && !apiKey.includes('your_openai_api_key')) {
      this.openai = new OpenAI({ apiKey: apiKey.trim() });
    } else {
      this.openai = null;
    }
  }

  /**
   * Formats a TimesheetEntry into the standardized document representation for vector storage
   */
  public formatDocument(entry: TimesheetEntry): string {
    return [
      `Jira Ticket: ${entry.jira}`,
      `Task: ${entry.task}`,
      `Date: ${entry.date}`,
      `Hours: ${entry.hours}`,
      `Project: ${entry.project || 'General'}`,
      `Description: ${entry.description || 'N/A'}`,
      `Comment: ${entry.comment || 'N/A'}`,
    ].join('\n');
  }

  /**
   * Generate an embedding vector for a single text string
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    this.refreshClient();

    if (!this.openai) {
      return this.generateDeterministicVector(text, 1536);
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text.replace(/\n+/g, ' ').trim(),
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (err: unknown) {
      const errorObj = err as any;
      const status = errorObj?.status || errorObj?.statusCode;
      const message = errorObj?.message || String(err);

      if (status === 401) {
        aiService.lastError = 'OpenAI 401: Invalid API Key. Please verify your OPENAI_API_KEY in .env';
      } else if (status === 429) {
        aiService.lastError = 'OpenAI 429: Quota or rate limit exceeded.';
      }
      console.warn(`OpenAI Embedding generation failed (${message}), using local deterministic vector.`);
      return this.generateDeterministicVector(text, 1536);
    }
  }

  /**
   * Generate embedding vectors in batches for optimal performance
   */
  public async generateBatchEmbeddings(texts: string[], batchSize = 50): Promise<number[][]> {
    this.refreshClient();

    if (!this.openai) {
      return texts.map((t) => this.generateDeterministicVector(t, 1536));
    }

    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const chunk = texts.slice(i, i + batchSize).map((t) => t.replace(/\n+/g, ' ').trim());

      try {
        const response = await this.openai.embeddings.create({
          model: this.embeddingModel,
          input: chunk,
          encoding_format: 'float',
        });

        const sorted = [...response.data].sort((a, b) => a.index - b.index);
        allEmbeddings.push(...sorted.map((item) => item.embedding));
      } catch (err: unknown) {
        const errorObj = err as any;
        const status = errorObj?.status || errorObj?.statusCode;
        const message = errorObj?.message || String(err);

        if (status === 401) {
          aiService.lastError = 'OpenAI 401: Invalid API Key. Please verify your OPENAI_API_KEY in .env';
        } else if (status === 429) {
          aiService.lastError = 'OpenAI 429: Quota or rate limit exceeded.';
        }
        console.warn(`OpenAI Batch Embedding generation failed (${message}), using local deterministic vectors for remaining chunks.`);

        // Fill remaining with deterministic vectors
        const remaining = texts.slice(allEmbeddings.length);
        allEmbeddings.push(...remaining.map((t) => this.generateDeterministicVector(t, 1536)));
        break;
      }
    }

    return allEmbeddings;
  }

  /**
   * Deterministic pseudo-embedding generator used for local test suites
   * and offline development when OPENAI_API_KEY is not configured
   */
  public generateDeterministicVector(text: string, dimensions = 1536): number[] {
    const vector = new Array<number>(dimensions).fill(0);
    const words = text.toLowerCase().split(/\W+/).filter(Boolean);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let hash = 0;
      for (let j = 0; j < word.length; j++) {
        hash = (hash << 5) - hash + word.charCodeAt(j);
        hash |= 0;
      }
      const idx = Math.abs(hash) % dimensions;
      vector[idx] += 1 / (i + 1);
    }

    // Normalize to unit length
    let norm = 0;
    for (let i = 0; i < dimensions; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dimensions; i++) {
        vector[i] /= norm;
      }
    } else {
      vector[0] = 1.0;
    }

    return vector;
  }
}

export const embeddingService = new EmbeddingService();
