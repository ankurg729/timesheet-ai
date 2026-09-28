export interface TimesheetEntry {
  id: string;
  date: string; // YYYY-MM-DD
  jira: string;
  task: string;
  description: string;
  comment: string;
  hours: number;
  project?: string;
  user?: string;
}

export interface NormalizationResult {
  entries: TimesheetEntry[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warnings: string[];
  errors: string[];
  dateRange?: {
    minDate: string;
    maxDate: string;
  };
}

export type DateFilterPreset = '30days' | '3months' | '6months' | 'all' | 'custom';

export interface DateFilter {
  preset?: DateFilterPreset;
  startDate?: string;
  endDate?: string;
}

export interface KeyHoursAllocation {
  key: string;
  hours: number;
  percentage: number;
}

export interface MonthlyAllocation {
  month: string; // 'YYYY-MM' or 'MMM YYYY'
  hours: number;
  percentage: number;
}

export interface AnalyticsSummary {
  totalHours: number;
  totalEntries: number;
  totalProjects: number;
  totalJiraTickets: number;
  topTask: { task: string; hours: number; percentage: number } | null;
  topJiraTicket: { jira: string; hours: number; percentage: number } | null;
  monthlyAllocation: MonthlyAllocation[];
  projectAllocation: Array<{ project: string; hours: number; percentage: number }>;
  jiraAllocation: Array<{ jira: string; hours: number; percentage: number }>;
  taskAllocation: Array<{ task: string; hours: number; percentage: number }>;
  topTasks: Array<{ task: string; hours: number; percentage: number }>;
  topJiraTickets: Array<{ jira: string; hours: number; percentage: number }>;
  dateRange?: {
    minDate: string;
    maxDate: string;
  };
}

export interface RAGSource {
  jira: string;
  task: string;
  date: string;
  hours: number;
  project?: string;
  description?: string;
  comment?: string;
}

export type QuestionType = 'analytics' | 'rag' | 'hybrid';

export interface QuestionClassification {
  type: QuestionType;
  reason: string;
  suggestedFilters?: {
    jira?: string;
    project?: string;
    task?: string;
    dateRange?: DateFilter;
  };
}

export interface ChatRequest {
  question: string;
  filter?: DateFilter;
}

export interface ChatResponse {
  question: string;
  questionType: QuestionType;
  answer: string;
  sources: RAGSource[];
  analyticsData?: Partial<AnalyticsSummary> | null;
  routingReason?: string;
}

export interface TimesheetStatus {
  uploaded: boolean;
  totalEntries: number;
  fileName?: string;
  chromaConnected: boolean;
  collectionCount: number;
  dateRange?: {
    minDate: string;
    maxDate: string;
  };
  sampleJiraTickets?: string[];
  sampleProjects?: string[];
}
