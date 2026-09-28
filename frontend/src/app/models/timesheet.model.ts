export interface TimesheetEntry {
  id: string;
  date: string;
  jira: string;
  task: string;
  description: string;
  comment: string;
  hours: number;
  project?: string;
  user?: string;
}

export type DateFilterPreset = 'all' | '30days' | '3months' | '6months' | 'custom';

export interface DateFilter {
  preset?: DateFilterPreset;
  startDate?: string;
  endDate?: string;
}

export interface MonthlyAllocation {
  month: string;
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

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  questionType?: QuestionType;
  routingReason?: string;
  sources?: RAGSource[];
  timestamp: Date;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  indexedCount: number;
  usedChroma: boolean;
  warnings?: string[];
  errors?: string[];
  analytics?: AnalyticsSummary;
  dateRange?: { minDate: string; maxDate: string };
}

export interface ChatResponse {
  success: boolean;
  question: string;
  questionType: QuestionType;
  answer: string;
  sources: RAGSource[];
  routingReason?: string;
}

export interface TimesheetStatus {
  uploaded: boolean;
  fileName?: string;
  totalEntries: number;
  chromaConnected: boolean;
  collectionCount: number;
  hasOpenAiKey: boolean;
  dateRange?: {
    minDate: string;
    maxDate: string;
  };
  sampleJiraTickets?: string[];
  sampleProjects?: string[];
}
