import { OpenAI } from 'openai';
import { RAGSource } from '../types/timesheet.types.js';

export class AiService {
  private openai: OpenAI | null = null;
  private chatModel: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.chatModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

    if (apiKey && apiKey.trim() !== '' && !apiKey.includes('your_openai_api_key')) {
      this.openai = new OpenAI({ apiKey: apiKey.trim() });
    }
  }

  /**
   * Check if OpenAI key is present
   */
  public hasApiKey(): boolean {
    const key = process.env.OPENAI_API_KEY;
    return !!key && key.trim() !== '' && !key.includes('your_openai_api_key');
  }

  /**
   * Reload client if environment changed
   */
  public refreshClient(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    this.chatModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
    if (apiKey && apiKey.trim() !== '' && !apiKey.includes('your_openai_api_key')) {
      this.openai = new OpenAI({ apiKey: apiKey.trim() });
    } else {
      this.openai = null;
    }
  }

  /**
   * Generate an answer from context using OpenAI chat completions
   */
  public async generateAnswer(
    question: string,
    context: string,
    questionType: 'analytics' | 'rag' | 'hybrid'
  ): Promise<string> {
    this.refreshClient();

    if (!this.openai) {
      return this.generateOfflineFallbackAnswer(question, context, questionType);
    }

    const systemPrompt = `You are a precise, professional AI Timesheet Assistant and Jira Analytics Expert.
Your task is to answer user questions about their logged timesheet data.

Strict guidelines:
1. Rely ONLY on the provided context below.
2. If the context does not contain enough information to answer reliably, respond EXACTLY:
   "I don't have enough information in the uploaded timesheet to answer this reliably."
3. NEVER fabricate, assume, or hallucinate hours, Jira ticket numbers, dates, tasks, or project names.
4. When numbers or percentages are present in the context, state them exactly as calculated.
5. Provide concise, clear, and actionable answers. Use bullet points where appropriate for readability.`;

    const userPrompt = `Context:
${context}

User Question: "${question}"

Question Category: ${questionType.toUpperCase()}

Please provide a factual, well-structured answer based strictly on the context above:`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1, // low temperature to ensure factuality
        max_tokens: 600,
      });

      const reply = response.choices[0]?.message?.content?.trim();
      return reply || "I don't have enough information in the uploaded timesheet to answer this reliably.";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`OpenAI completion failed: ${message}, generating formatted answer.`);
      return this.generateOfflineFallbackAnswer(question, context, questionType);
    }
  }

  /**
   * Offline fallback generator for development and testing without an active API key
   */
  public generateOfflineFallbackAnswer(
    question: string,
    context: string,
    questionType: 'analytics' | 'rag' | 'hybrid'
  ): string {
    if (!context || context.trim() === '' || context.includes('NO_RELEVANT_DATA')) {
      return "I don't have enough information in the uploaded timesheet to answer this reliably.";
    }

    if (questionType === 'analytics') {
      return `Based on structured timesheet analytics:\n\n${context}\n\n*(Calculated with TypeScript Analytics Engine)*`;
    }

    if (questionType === 'hybrid') {
      return `Summary & Work Details:\n\n${context}\n\n*(Synthesized using Structured Analytics + RAG Vector Search)*`;
    }

    // RAG answer fallback
    return `Based on the timesheet records for your query:\n\n${context}\n\n*(Retrieved via Vector Semantic Search)*`;
  }
}

export const aiService = new AiService();
