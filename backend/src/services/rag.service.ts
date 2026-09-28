import {
  ChatResponse,
  DateFilter,
  QuestionClassification,
  QuestionType,
  RAGSource,
  TimesheetEntry,
} from '../types/timesheet.types.js';
import { aiService } from './ai.service.js';
import { analyticsService } from './analytics.service.js';
import { chromaService } from './chroma.service.js';
import { embeddingService } from './embedding.service.js';

export class RagService {
  /**
   * Classify user question into 'analytics' | 'rag' | 'hybrid'
   */
  public classifyQuestion(question: string, entries: TimesheetEntry[]): QuestionClassification {
    const q = question.toLowerCase().trim();

    // Numerical / Analytical signals
    const analyticalPatterns = [
      /\bhow many hours\b/,
      /\btotal hours\b/,
      /\bhow much time\b/,
      /\bhours spent\b/,
      /\bpercentage\b/,
      /\ballocation\b/,
      /\bwhich jira ticket\b/,
      /\bwhich ticket\b/,
      /\bconsumed the most hours\b/,
      /\bconsumed most of my time\b/,
      /\bmost hours\b/,
      /\bmost time\b/,
      /\btop task\b/,
      /\btop jira\b/,
      /\btop ticket\b/,
      /\bhighest allocation\b/,
      /\bmonthly allocation\b/,
      /\bmonthly hours\b/,
      /\bhours did i work\b/,
      /\bhow long did i work\b/,
      /\bbreakdown of hours\b/,
      /\bbreakdown\b/,
      /\bdistribution\b/,
    ];

    // Semantic / RAG signals
    const semanticPatterns = [
      /\bwhat work did i\b/,
      /\bwhat did i work on\b/,
      /\bwhat did i do\b/,
      /\bsummarize\b/,
      /\bactivities\b/,
      /\bwhat activities\b/,
      /\bwhy did i\b/,
      /\btype of work\b/,
      /\bwhat type of work\b/,
      /\bperform\b/,
      /\bdetails\b/,
      /\bexplain\b/,
      /\bdescribe\b/,
      /\bwork performed\b/,
      /\bwhat was involved\b/,
      /\bwhat is the task\b/,
      /\btask about\b/,
      /\btell me about\b/,
      /\babout ticket\b/,
      /\babout jira\b/,
      /\bwhat is\b/,
    ];

    const isAnalytical = analyticalPatterns.some((pattern) => pattern.test(q));
    const isSemantic = semanticPatterns.some((pattern) => pattern.test(q));
    const isCompare = /\bcompare\b/.test(q);

    // Extract potential Jira ticket (e.g. PAM-347, PAM-382)
    const jiraMatch = question.match(/\b([a-zA-Z]{2,10}-\d+)\b/);
    const jira = jiraMatch ? jiraMatch[1].toUpperCase() : undefined;

    // Extract potential Project name from entries
    const knownProjects = Array.from(
      new Set(entries.map((e) => e.project).filter((p): p is string => Boolean(p)))
    );
    const project = knownProjects.find((p) => q.includes(p.toLowerCase()));

    // Hybrid if both analytical & semantic elements present or if comparison requested
    if ((isAnalytical && isSemantic) || isCompare) {
      return {
        type: 'hybrid',
        reason: 'Question requires both quantitative calculation and semantic work description.',
        suggestedFilters: { jira, project },
      };
    }

    if (isAnalytical) {
      return {
        type: 'analytics',
        reason: 'Question targets numerical aggregation, totals, percentages, or top rankings.',
        suggestedFilters: { jira, project },
      };
    }

    // Default to RAG for exploratory, semantic, or descriptive queries
    return {
      type: 'rag',
      reason: 'Question seeks descriptive, summary, or contextual worklog information.',
      suggestedFilters: { jira, project },
    };
  }

  /**
   * Main query execution pipeline routing between Analytics, RAG, and Hybrid
   */
  public async handleChat(
    question: string,
    entries: TimesheetEntry[],
    dateFilter?: DateFilter
  ): Promise<ChatResponse> {
    if (!question || question.trim() === '') {
      return {
        question: '',
        questionType: 'rag',
        answer: 'Please provide a question about your timesheet.',
        sources: [],
      };
    }

    if (entries.length === 0) {
      return {
        question,
        questionType: 'rag',
        answer: "I don't have enough information in the uploaded timesheet to answer this reliably. Please upload a timesheet first.",
        sources: [],
      };
    }

    // Apply any active date filter to entries
    const activeEntries = analyticsService.filterEntries(entries, dateFilter);
    const classification = this.classifyQuestion(question, activeEntries);

    switch (classification.type) {
      case 'analytics':
        return this.handleAnalyticsQuestion(question, activeEntries, classification);
      case 'hybrid':
        return this.handleHybridQuestion(question, activeEntries, classification, dateFilter);
      case 'rag':
      default:
        return this.handleRagQuestion(question, activeEntries, classification, dateFilter);
    }
  }

  /**
   * Route 1: Analytics question handler
   */
  private async handleAnalyticsQuestion(
    question: string,
    entries: TimesheetEntry[],
    classification: QuestionClassification
  ): Promise<ChatResponse> {
    const q = question.toLowerCase();
    const totalHours = analyticsService.getTotalHours(entries);
    const sources: RAGSource[] = [];
    let analyticsContext = '';

    // Check month mention (e.g. "in August", "in June", "August")
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];
    const mentionedMonthIndex = monthNames.findIndex((m) => q.includes(m));

    if (mentionedMonthIndex !== -1) {
      const monthNum = String(mentionedMonthIndex + 1).padStart(2, '0');
      const monthlyEntries = entries.filter((e) => e.date.slice(5, 7) === monthNum);
      const monthHours = analyticsService.getTotalHours(monthlyEntries);
      const monthPct = analyticsService.getAllocationPercentage(monthHours, totalHours);
      const monthName = monthNames[mentionedMonthIndex];
      const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);

      analyticsContext = [
        `Timesheet Allocation for ${capitalized}:`,
        `- Hours Logged: ${monthHours} hours`,
        `- Total Timesheet Hours: ${totalHours} hours`,
        `- Allocation Percentage: ${monthPct}% of overall time`,
        `- Number of Logged Entries: ${monthlyEntries.length}`,
      ].join('\n');

      for (const e of monthlyEntries.slice(0, 5)) {
        sources.push({
          jira: e.jira,
          task: e.task,
          date: e.date,
          hours: e.hours,
          project: e.project,
          description: e.description,
          comment: e.comment,
        });
      }
    } else if (classification.suggestedFilters?.jira) {
      // Specific Jira ticket
      const jiraKey = classification.suggestedFilters.jira;
      const data = analyticsService.getHoursForJira(entries, jiraKey);

      if (data.entries.length === 0) {
        const prefix = jiraKey.split('-')[0].toUpperCase();
        const related = entries.filter(
          (e) =>
            e.jira.toUpperCase().startsWith(prefix + '-') ||
            (e.project && e.project.toUpperCase() === prefix)
        );

        const ticketMap = new Map<string, { task: string; hours: number }>();
        for (const e of related) {
          const existing = ticketMap.get(e.jira);
          if (existing) {
            existing.hours += e.hours;
          } else {
            ticketMap.set(e.jira, { task: e.task, hours: e.hours });
          }
        }

        const ticketList = Array.from(ticketMap.entries())
          .sort((a, b) => b[1].hours - a[1].hours)
          .map(([k, v]) => `- ${k}: ${v.task} (${Math.round(v.hours * 10) / 10} hours)`)
          .join('\n');

        analyticsContext = [
          `Notice: Jira ticket "${jiraKey}" was NOT found in the uploaded timesheet.`,
          related.length > 0
            ? `Available tickets logged under project "${prefix}":\n${ticketList}`
            : `No tickets matching "${prefix}" were found in this timesheet.`,
        ].join('\n');
      } else {
        analyticsContext = [
          `Analytics for Ticket ${data.jira}:`,
          `- Task: ${data.entries[0]?.task || 'N/A'}`,
          `- Total Hours Logged: ${data.hours} hours`,
          `- Total Timesheet Hours: ${totalHours} hours`,
          `- Ticket Allocation: ${data.percentage}%`,
          `- Log Count: ${data.entries.length} entries`,
        ].join('\n');

        for (const e of data.entries.slice(0, 5)) {
          sources.push({
            jira: e.jira,
            task: e.task,
            date: e.date,
            hours: e.hours,
            project: e.project,
            description: e.description,
            comment: e.comment,
          });
        }
      }
    } else if (classification.suggestedFilters?.project) {
      // Specific Project (e.g. "PAM")
      const projName = classification.suggestedFilters.project;
      const data = analyticsService.getHoursForProject(entries, projName);

      analyticsContext = [
        `Project Allocation for "${data.project}":`,
        `- Logged Hours: ${data.hours} hours`,
        `- Overall Timesheet Hours: ${totalHours} hours`,
        `- Project Allocation: ${data.percentage}%`,
        `- Number of Worklogs: ${data.entries.length}`,
      ].join('\n');

      for (const e of data.entries.slice(0, 5)) {
        sources.push({
          jira: e.jira,
          task: e.task,
          date: e.date,
          hours: e.hours,
          project: e.project,
          description: e.description,
          comment: e.comment,
        });
      }
    } else if (q.includes('monthly')) {
      // Monthly breakdown
      const monthly = analyticsService.getMonthlyAllocation(entries);
      analyticsContext = [
        `Monthly Hours & Allocation Breakdown:`,
        ...monthly.map((m) => `- ${m.month}: ${m.hours} hours (${m.percentage}%)`),
        `- Total Overall Hours: ${totalHours} hours`,
      ].join('\n');
    } else if (q.includes('ticket') || q.includes('jira')) {
      // Top Jira tickets
      const topJiras = analyticsService.getTopJiraTickets(entries, 5);
      const top = topJiras[0];
      analyticsContext = [
        `Jira Ticket Breakdown:`,
        top ? `Top Jira Ticket: ${top.jira} with ${top.hours} hours (${top.percentage}% allocation)` : '',
        ...topJiras.map((j) => `- ${j.jira}: ${j.hours} hours (${j.percentage}%)`),
        `- Total Hours: ${totalHours} hours`,
      ].filter(Boolean).join('\n');

      if (top) {
        const topEntries = entries.filter((e) => e.jira === top.jira).slice(0, 5);
        for (const e of topEntries) {
          sources.push({
            jira: e.jira,
            task: e.task,
            date: e.date,
            hours: e.hours,
            project: e.project,
            description: e.description,
            comment: e.comment,
          });
        }
      }
    } else if (q.includes('task')) {
      // Top tasks
      const topTasks = analyticsService.getTopTasks(entries, 5);
      const top = topTasks[0];
      analyticsContext = [
        `Task Breakdown:`,
        top ? `Top Task: "${top.task}" with ${top.hours} hours (${top.percentage}% allocation)` : '',
        ...topTasks.map((t) => `- "${t.task}": ${t.hours} hours (${t.percentage}%)`),
        `- Total Hours: ${totalHours} hours`,
      ].filter(Boolean).join('\n');

      if (top) {
        const topEntries = entries.filter((e) => e.task === top.task).slice(0, 5);
        for (const e of topEntries) {
          sources.push({
            jira: e.jira,
            task: e.task,
            date: e.date,
            hours: e.hours,
            project: e.project,
            description: e.description,
            comment: e.comment,
          });
        }
      }
    } else {
      // Overall summary
      const projects = analyticsService.getProjectAllocation(entries);
      analyticsContext = [
        `Total Timesheet Summary:`,
        `- Total Logged Hours: ${totalHours} hours`,
        `- Total Entries: ${entries.length}`,
        `- Project Allocations:`,
        ...projects.map((p) => `  * ${p.project}: ${p.hours} hours (${p.percentage}%)`),
      ].join('\n');
    }

    const answer = await aiService.generateAnswer(question, analyticsContext, 'analytics');

    return {
      question,
      questionType: 'analytics',
      answer,
      sources,
      routingReason: classification.reason,
    };
  }

  /**
   * Route 2: RAG question handler
   */
  private async handleRagQuestion(
    question: string,
    entries: TimesheetEntry[],
    classification: QuestionClassification,
    dateFilter?: DateFilter
  ): Promise<ChatResponse> {
    const mentionedJira = classification.suggestedFilters?.jira;
    const ticketExists = mentionedJira
      ? entries.some((e) => e.jira.toUpperCase() === mentionedJira.toUpperCase())
      : false;

    // Special handling when user asks about a ticket that does NOT exist in the timesheet
    if (mentionedJira && !ticketExists) {
      const prefix = mentionedJira.split('-')[0].toUpperCase();
      const related = entries.filter(
        (e) =>
          e.jira.toUpperCase().startsWith(prefix + '-') ||
          (e.project && e.project.toUpperCase() === prefix)
      );

      if (related.length > 0) {
        const ticketMap = new Map<string, { task: string; hours: number }>();
        for (const e of related) {
          const existing = ticketMap.get(e.jira);
          if (existing) {
            existing.hours += e.hours;
          } else {
            ticketMap.set(e.jira, { task: e.task, hours: e.hours });
          }
        }

        const ticketList = Array.from(ticketMap.entries())
          .sort((a, b) => b[1].hours - a[1].hours)
          .map(([k, v]) => `- ${k}: ${v.task} (${Math.round(v.hours * 10) / 10} hours logged)`)
          .join('\n');

        const context = [
          `Question: "${question}"`,
          `Notice: Jira ticket "${mentionedJira}" was NOT found in the uploaded timesheet.`,
          `Available tickets logged under project "${prefix}":`,
          ticketList,
        ].join('\n');

        const answer = await aiService.generateAnswer(question, context, 'rag');
        const sources: RAGSource[] = related.slice(0, 4).map((e) => ({
          jira: e.jira,
          task: e.task,
          date: e.date,
          hours: e.hours,
          project: e.project,
          description: e.description,
          comment: e.comment,
        }));

        return {
          question,
          questionType: 'rag',
          answer,
          sources,
          routingReason: classification.reason,
        };
      }
    }

    // Normal RAG search
    const queryEmbedding = await embeddingService.generateEmbedding(question);

    let retrieved = await chromaService.query(queryEmbedding, 5, {
      jira: ticketExists ? mentionedJira : undefined,
      project: classification.suggestedFilters?.project,
      dateFilter,
    });

    // If metadata filter was too restrictive, retry without filter
    if (retrieved.length === 0 && (mentionedJira || classification.suggestedFilters?.project)) {
      retrieved = await chromaService.query(queryEmbedding, 5, { dateFilter });
    }

    // Fallback: direct ticket lookup in entries if vector returned empty
    if (retrieved.length === 0 && ticketExists && mentionedJira) {
      const directMatches = entries.filter((e) => e.jira.toUpperCase() === mentionedJira.toUpperCase());
      retrieved = directMatches.slice(0, 5).map((e) => ({
        document: embeddingService.formatDocument(e),
        metadata: e,
        distance: 0,
        source: {
          jira: e.jira,
          task: e.task,
          date: e.date,
          hours: e.hours,
          project: e.project,
          description: e.description,
          comment: e.comment,
        },
      }));
    }

    if (retrieved.length === 0) {
      return {
        question,
        questionType: 'rag',
        answer: "I don't have enough information in the uploaded timesheet to answer this reliably.",
        sources: [],
        routingReason: classification.reason,
      };
    }

    // Build concise RAG context
    const contextBlocks = retrieved.map((item, idx) => {
      const src = item.source;
      return [
        `[Log ${idx + 1}]`,
        `Jira: ${src.jira}`,
        `Task: ${src.task}`,
        `Date: ${src.date}`,
        `Hours: ${src.hours}`,
        `Project: ${src.project || 'General'}`,
        src.description ? `Description: ${src.description}` : '',
        src.comment ? `Comment: ${src.comment}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    });

    const fullContext = contextBlocks.join('\n\n');
    const answer = await aiService.generateAnswer(question, fullContext, 'rag');

    return {
      question,
      questionType: 'rag',
      answer,
      sources: retrieved.map((r) => r.source),
      routingReason: classification.reason,
    };
  }

  /**
   * Route 3: Hybrid question handler combining Structured Analytics + RAG Vector Search
   */
  private async handleHybridQuestion(
    question: string,
    entries: TimesheetEntry[],
    classification: QuestionClassification,
    dateFilter?: DateFilter
  ): Promise<ChatResponse> {
    const totalHours = analyticsService.getTotalHours(entries);

    // 1. Structured Analytics section
    const analyticsSections: string[] = [];

    if (classification.suggestedFilters?.project) {
      const pData = analyticsService.getHoursForProject(
        entries,
        classification.suggestedFilters.project
      );
      analyticsSections.push(
        `Project "${pData.project}": ${pData.hours} hours (${pData.percentage}% of ${totalHours} total hours)`
      );
    } else if (classification.suggestedFilters?.jira) {
      const jData = analyticsService.getHoursForJira(
        entries,
        classification.suggestedFilters.jira
      );
      analyticsSections.push(
        `Ticket "${jData.jira}": ${jData.hours} hours (${jData.percentage}% of ${totalHours} total hours)`
      );
    } else {
      const topProjects = analyticsService.getProjectAllocation(entries);
      if (topProjects.length > 0) {
        const top = topProjects[0];
        analyticsSections.push(
          `Project Consuming Most Time: "${top.project}" with ${top.hours} hours (${top.percentage}% allocation)`
        );
      }
    }

    // 2. Semantic Vector Search section
    const queryEmbedding = await embeddingService.generateEmbedding(question);
    const retrieved = await chromaService.query(queryEmbedding, 6, {
      jira: classification.suggestedFilters?.jira,
      project: classification.suggestedFilters?.project,
      dateFilter,
    });

    const worklogBlocks = retrieved.map((item, idx) => {
      const src = item.source;
      return [
        `[Worklog ${idx + 1}] Ticket: ${src.jira} | Task: ${src.task} | Date: ${src.date} | Hours: ${src.hours}`,
        src.description ? `Description: ${src.description}` : '',
        src.comment ? `Comment: ${src.comment}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    });

    const hybridContext = [
      '### Structured Analytics Calculations:',
      ...analyticsSections,
      `- Overall Total Hours: ${totalHours} hours`,
      '',
      '### Relevant Worklog Records (from Vector Search):',
      worklogBlocks.length > 0 ? worklogBlocks.join('\n\n') : 'NO_RELEVANT_DATA',
    ].join('\n');

    const answer = await aiService.generateAnswer(question, hybridContext, 'hybrid');

    return {
      question,
      questionType: 'hybrid',
      answer,
      sources: retrieved.map((r) => r.source),
      routingReason: classification.reason,
    };
  }
}

export const ragService = new RagService();
