import { OpenAI } from 'openai';
import { RAGSource } from '../types/timesheet.types.js';

export class AiService {
  private openai: OpenAI | null = null;
  private chatModel: string = 'gpt-4o-mini';
  public lastError: string | null = null;

  constructor() {
    this.refreshClient();
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
      try {
        this.openai = new OpenAI({ apiKey: apiKey.trim() });
      } catch (err) {
        console.warn('Failed to initialize OpenAI client:', err);
        this.openai = null;
      }
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
      return this.generateNaturalLanguageAnswer(question, context, questionType);
    }

    const systemPrompt = `You are an intelligent, articulate AI Timesheet Assistant and Jira Analytics Expert.
Your task is to answer user questions about their logged timesheet data in fluent, professional, and natural language.

Strict guidelines:
1. Rely ONLY on the provided context below.
2. If the context states that a specific ticket or data does not exist, explain politely that it was not found and mention the available related tickets or projects provided in the context.
3. If the context does not contain enough information to answer reliably, respond EXACTLY:
   "I don't have enough information in the uploaded timesheet to answer this reliably."
4. NEVER fabricate or hallucinate hours, Jira ticket numbers, dates, tasks, or project names.
5. Format answers clearly using markdown bolding and bullet points for readability.`;

    const userPrompt = `Context:
${context}

User Question: "${question}"

Question Category: ${questionType.toUpperCase()}

Please provide a helpful, natural-language answer based strictly on the context above:`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1, // low temperature to ensure factuality
        max_tokens: 650,
      });

      this.lastError = null;
      const reply = response.choices[0]?.message?.content?.trim();
      return reply || "I don't have enough information in the uploaded timesheet to answer this reliably.";
    } catch (err: unknown) {
      const errorObj = err as any;
      const statusCode = errorObj?.status || errorObj?.statusCode;
      const message = errorObj?.message || String(err);

      if (statusCode === 401) {
        this.lastError = 'OpenAI 401: Invalid API Key. Please verify your OPENAI_API_KEY in .env';
        console.warn(`[OpenAI Error 401] Invalid or expired API key. Falling back to local Natural Language Generation.`);
      } else if (statusCode === 429) {
        this.lastError = 'OpenAI 429: Quota or rate limit exceeded. Please check your OpenAI account billing.';
        console.warn(`[OpenAI Error 429] Rate limit/quota exceeded.`);
      } else {
        this.lastError = `OpenAI API Error: ${message}`;
        console.warn(`[OpenAI Error] ${message}`);
      }

      return this.generateNaturalLanguageAnswer(question, context, questionType);
    }
  }

  /**
   * High-quality local Natural Language Generation (NLG) engine used when
   * offline or when OpenAI API key is unavailable/invalid.
   * Transforms structured data and retrieved logs into coherent, conversational English.
   */
  public generateNaturalLanguageAnswer(
    question: string,
    context: string,
    questionType: 'analytics' | 'rag' | 'hybrid'
  ): string {
    if (!context || context.trim() === '' || context.includes('NO_RELEVANT_DATA')) {
      return "I don't have enough information in the uploaded timesheet to answer this reliably.";
    }

    // Case 1: Ticket not found notice
    if (context.includes('Notice: Jira ticket') || context.includes('Notice: The requested Jira ticket')) {
      return this.formatTicketNotFoundResponse(context);
    }

    // Case 2: Analytics questions
    if (questionType === 'analytics') {
      return this.formatAnalyticsResponse(question, context);
    }

    // Case 3: RAG Semantic questions
    if (questionType === 'rag') {
      return this.formatRagResponse(question, context);
    }

    // Case 4: Hybrid questions
    return this.formatHybridResponse(question, context);
  }

  private formatTicketNotFoundResponse(context: string): string {
    const lines = context.split('\n').map((l) => l.trim()).filter(Boolean);
    const noticeLine = lines.find((l) => l.startsWith('Notice:'));
    const ticketMatch = noticeLine ? noticeLine.match(/"([^"]+)"/) : null;
    const ticketName = ticketMatch ? ticketMatch[1] : 'the requested ticket';

    const availableTickets: string[] = [];
    let collecting = false;
    let projectName = '';

    for (const line of lines) {
      if (line.includes('Available tickets') || line.includes('active tickets')) {
        collecting = true;
        const pMatch = line.match(/project "([^"]+)"/);
        if (pMatch) projectName = pMatch[1];
        continue;
      }
      if (collecting && (line.startsWith('-') || line.startsWith('•') || line.startsWith('*'))) {
        availableTickets.push(line.replace(/^[-•*]\s*/, ''));
      }
    }

    let response = `I searched your uploaded timesheet, but ticket **${ticketName}** was not found in the records.`;

    if (availableTickets.length > 0) {
      response += `\n\nHowever, here are the available tickets logged under project **${projectName || 'the same area'}**:\n`;
      for (const t of availableTickets) {
        response += `- **${t}**\n`;
      }
      response += `\nPlease check if you intended to ask about one of these tickets (such as **${availableTickets[0].split(':')[0]}**).`;
    } else {
      response += `\nPlease verify the ticket key or check the uploaded timesheet file.`;
    }

    return response;
  }

  private formatRagResponse(question: string, context: string): string {
    // Parse log blocks
    const logs = this.parseLogBlocks(context);

    if (logs.length === 0) {
      return "I don't have enough information in the uploaded timesheet to answer this reliably.";
    }

    const first = logs[0];
    const totalHours = Math.round(logs.reduce((sum, l) => sum + (l.hours || 0), 0) * 10) / 10;
    const taskName = first.task || 'General Task';
    const jiraKey = first.jira || '';
    const projectName = first.project || 'General';

    let answer = '';

    if (jiraKey && jiraKey !== 'NO-TICKET') {
      answer += `The task for ticket **${jiraKey}** is **${taskName}** (Project: **${projectName}**). A total of **${totalHours} hours** was logged across ${logs.length} worklog ${logs.length > 1 ? 'entries' : 'entry'}.\n\n`;
    } else {
      answer += `For **${taskName}** (Project: **${projectName}**), a total of **${totalHours} hours** was recorded across ${logs.length} worklog ${logs.length > 1 ? 'entries' : 'entry'}.\n\n`;
    }

    answer += `**Key activities and details:**\n`;
    const seenActivities = new Set<string>();

    for (const log of logs) {
      const desc = log.description?.trim();
      const comment = log.comment?.trim();

      if (desc && !seenActivities.has(desc.toLowerCase())) {
        seenActivities.add(desc.toLowerCase());
        answer += `- ${desc}${log.hours ? ` *(${log.hours}h on ${log.date})*` : ''}\n`;
      }
      if (comment && comment !== desc && !seenActivities.has(comment.toLowerCase())) {
        seenActivities.add(comment.toLowerCase());
        answer += `- ${comment}\n`;
      }
    }

    return answer.trim();
  }

  private formatAnalyticsResponse(question: string, context: string): string {
    return context
      .replace(/###?\s*/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
  }

  private formatHybridResponse(question: string, context: string): string {
    const parts = context.split('### Relevant Worklog Records');
    const analyticsPart = parts[0] || '';
    const ragPart = parts[1] || '';

    let answer = `Here is the combined summary of your work and effort allocation:\n\n`;

    // Analytics section
    const cleanAnalytics = analyticsPart
      .replace(/###?\s*/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.includes('Structured Analytics Calculations'))
      .join('\n');

    if (cleanAnalytics) {
      answer += `**Allocation Summary:**\n${cleanAnalytics}\n\n`;
    }

    // Worklog details
    const logs = this.parseLogBlocks(ragPart);
    if (logs.length > 0) {
      answer += `**Key Work Performed:**\n`;
      const seen = new Set<string>();
      for (const log of logs) {
        const text = log.description || log.comment;
        if (text && !seen.has(text.toLowerCase())) {
          seen.add(text.toLowerCase());
          answer += `- **[${log.jira}] ${log.task}**: ${text} *(${log.hours}h)*\n`;
        }
      }
    }

    return answer.trim();
  }

  private parseLogBlocks(text: string): Array<{
    jira: string;
    task: string;
    date: string;
    hours: number;
    project: string;
    description: string;
    comment: string;
  }> {
    const blocks = text.split(/\[(?:Log|Worklog)\s*\d*\]/i).filter((b) => b.trim());
    const results: any[] = [];

    for (const b of blocks) {
      const jiraMatch = b.match(/Jira:\s*([^\n|]+)/i) || b.match(/Ticket:\s*([^\n|]+)/i);
      const taskMatch = b.match(/Task:\s*([^\n|]+)/i);
      const dateMatch = b.match(/Date:\s*([^\n|]+)/i);
      const hoursMatch = b.match(/Hours:\s*([\d.]+)/i);
      const projMatch = b.match(/Project:\s*([^\n|]+)/i);
      const descMatch = b.match(/Description:\s*([^\n]+)/i);
      const commMatch = b.match(/Comment:\s*([^\n]+)/i);

      if (jiraMatch || taskMatch) {
        results.push({
          jira: jiraMatch ? jiraMatch[1].trim() : 'NO-TICKET',
          task: taskMatch ? taskMatch[1].trim() : '',
          date: dateMatch ? dateMatch[1].trim() : '',
          hours: hoursMatch ? parseFloat(hoursMatch[1]) : 0,
          project: projMatch ? projMatch[1].trim() : 'General',
          description: descMatch ? descMatch[1].trim() : '',
          comment: commMatch ? commMatch[1].trim() : '',
        });
      }
    }

    return results;
  }
}

export const aiService = new AiService();
