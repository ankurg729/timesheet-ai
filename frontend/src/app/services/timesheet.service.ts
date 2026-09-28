import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';
import {
  AnalyticsSummary,
  ChatMessage,
  ChatResponse,
  DateFilter,
  TimesheetStatus,
  UploadResponse,
} from '../models/timesheet.model';

@Injectable({
  providedIn: 'root',
})
export class TimesheetService {
  private readonly baseUrl = '/api/timesheet';

  // Angular Signals for State Management
  public readonly status = signal<TimesheetStatus | null>(null);
  public readonly analytics = signal<AnalyticsSummary | null>(null);
  public readonly activeFilter = signal<DateFilter>({ preset: 'all' });
  public readonly chatMessages = signal<ChatMessage[]>([]);
  public readonly isUploading = signal<boolean>(false);
  public readonly isAsking = signal<boolean>(false);
  public readonly errorMessage = signal<string | null>(null);
  public readonly notificationMessage = signal<string | null>(null);

  // Computed signals
  public readonly hasData = computed(() => {
    const s = this.status();
    return !!(s && s.uploaded && s.totalEntries > 0);
  });

  public readonly totalHours = computed(() => this.analytics()?.totalHours || 0);

  constructor(private http: HttpClient) {
    this.checkStatus();
  }

  public clearMessages(): void {
    this.errorMessage.set(null);
    this.notificationMessage.set(null);
  }

  public checkStatus(): void {
    this.http.get<TimesheetStatus>(`${this.baseUrl}/status`).subscribe({
      next: (st) => {
        this.status.set(st);
        if (st.uploaded && !this.analytics()) {
          this.fetchAnalytics();
        }
      },
      error: (err) => {
        console.warn('Backend not yet reachable or status check failed', err);
      },
    });
  }

  public uploadExcel(file: File): Observable<UploadResponse> {
    this.clearMessages();
    this.isUploading.set(true);

    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http.post<UploadResponse>(`${this.baseUrl}/upload`, formData).pipe(
      tap((res) => {
        this.isUploading.set(false);
        if (res.analytics) {
          this.analytics.set(res.analytics);
        }
        this.notificationMessage.set(
          `Successfully processed ${res.validRows} rows from "${res.fileName}".`
        );
        this.checkStatus();
      }),
      catchError((err) => {
        this.isUploading.set(false);
        const msg = err.error?.message || err.message || 'File upload failed';
        this.errorMessage.set(msg);
        return throwError(() => err);
      })
    );
  }

  public loadSampleData(): Observable<UploadResponse> {
    this.clearMessages();
    this.isUploading.set(true);

    return this.http.post<UploadResponse>(`${this.baseUrl}/load-sample`, {}).pipe(
      tap((res) => {
        this.isUploading.set(false);
        if (res.analytics) {
          this.analytics.set(res.analytics);
        }
        this.notificationMessage.set(
          `Demo Jira timesheet loaded (${res.validRows} rows, PAM, PreAuth, Provider Registration).`
        );
        this.checkStatus();
      }),
      catchError((err) => {
        this.isUploading.set(false);
        const msg = err.error?.message || err.message || 'Failed to load demo dataset';
        this.errorMessage.set(msg);
        return throwError(() => err);
      })
    );
  }

  public fetchAnalytics(filter?: DateFilter): void {
    const f = filter || this.activeFilter();
    let params = new HttpParams();

    if (f.preset) {
      params = params.set('preset', f.preset);
    }
    if (f.startDate) {
      params = params.set('startDate', f.startDate);
    }
    if (f.endDate) {
      params = params.set('endDate', f.endDate);
    }

    this.http.get<{ success: boolean; data: AnalyticsSummary }>(`${this.baseUrl}/analytics`, { params })
      .subscribe({
        next: (res) => {
          if (res.data) {
            this.analytics.set(res.data);
          }
        },
        error: (err) => {
          console.error('Failed to fetch analytics', err);
        },
      });
  }

  public applyFilter(filter: DateFilter): void {
    this.activeFilter.set(filter);
    this.fetchAnalytics(filter);
  }

  public askQuestion(questionText: string): void {
    const q = questionText.trim();
    if (!q) return;

    this.clearMessages();
    this.isAsking.set(true);

    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: q,
      timestamp: new Date(),
    };

    // Add user message to signal
    this.chatMessages.update((msgs) => [...msgs, userMessage]);

    this.http
      .post<ChatResponse>(`${this.baseUrl}/chat`, {
        question: q,
        filter: this.activeFilter(),
      })
      .subscribe({
        next: (res) => {
          this.isAsking.set(false);
          const aiMessage: ChatMessage = {
            id: `ai_${Date.now()}`,
            sender: 'assistant',
            text: res.answer,
            questionType: res.questionType,
            routingReason: res.routingReason,
            sources: res.sources || [],
            timestamp: new Date(),
          };
          this.chatMessages.update((msgs) => [...msgs, aiMessage]);
        },
        error: (err) => {
          this.isAsking.set(false);
          const errorMsg = err.error?.message || 'Failed to get answer from AI Assistant';
          this.errorMessage.set(errorMsg);

          const errorMessage: ChatMessage = {
            id: `ai_err_${Date.now()}`,
            sender: 'assistant',
            text: `Error: ${errorMsg}`,
            timestamp: new Date(),
          };
          this.chatMessages.update((msgs) => [...msgs, errorMessage]);
        },
      });
  }

  public reindex(): void {
    this.clearMessages();
    this.http.post(`${this.baseUrl}/reindex`, {}).subscribe({
      next: (res: any) => {
        this.notificationMessage.set(
          `Re-indexing complete (${res.count} records). ChromaDB status: ${res.usedChroma ? 'Connected' : 'In-Memory Fallback'}`
        );
        this.checkStatus();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Re-indexing failed');
      },
    });
  }
}
