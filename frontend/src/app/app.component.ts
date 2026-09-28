import {
  Component,
  ElementRef,
  ViewChild,
  effect,
  signal,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { TimesheetService } from './services/timesheet.service';
import { DateFilterPreset } from './models/timesheet.model';

Chart.register(...registerables);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements AfterViewInit {
  @ViewChild('monthlyCanvas') monthlyCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('projectCanvas') projectCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('taskCanvas') taskCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('jiraCanvas') jiraCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatScrollContainer') chatScrollContainer!: ElementRef<HTMLDivElement>;

  public selectedFile = signal<File | null>(null);
  public selectedFileName = signal<string>('');
  public userQuestion = signal<string>('');
  public customStartDate = signal<string>('');
  public customEndDate = signal<string>('');
  public activeFilterPreset = signal<DateFilterPreset>('all');
  public expandedSources = signal<Record<string, boolean>>({});

  private monthlyChart: Chart | null = null;
  private projectChart: Chart | null = null;
  private taskChart: Chart | null = null;
  private jiraChart: Chart | null = null;
  private viewInitialized = false;

  // Preset demo questions
  public quickQuestions = [
    'What was my total allocation in the last 3 months?',
    'Which Jira ticket consumed the most hours?',
    'What percentage of my time was spent on PAM?',
    'Show my monthly allocation.',
    'Which task consumed the most time?',
    'What work did I perform on PAM-382?',
    'Summarize my Provider Registration work.',
    'What activities were related to PreAuth?',
    'What did I work on during the skeleton loading task?',
    'How many hours did I spend on PreAuth and what work did I perform?',
    'Which project consumed most of my time and what type of work was involved?',
    'Compare my PreAuth and Provider Registration work.',
  ];

  constructor(public timesheetService: TimesheetService) {
    // Reactive effect: whenever analytics signal changes, render/update charts
    effect(() => {
      const summary = this.timesheetService.analytics();
      if (this.viewInitialized && summary) {
        // Run on next tick after DOM has updated
        setTimeout(() => this.renderCharts(), 50);
      }
    });

    // Auto scroll chat when messages update
    effect(() => {
      const messages = this.timesheetService.chatMessages();
      if (messages.length > 0 && this.chatScrollContainer) {
        setTimeout(() => {
          const el = this.chatScrollContainer?.nativeElement;
          if (el) {
            el.scrollTop = el.scrollHeight;
          }
        }, 80);
      }
    });
  }

  public ngAfterViewInit(): void {
    this.viewInitialized = true;
    if (this.timesheetService.analytics()) {
      setTimeout(() => this.renderCharts(), 100);
    }
  }

  public onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.selectedFile.set(file);
      this.selectedFileName.set(file.name);
    }
  }

  public uploadFile(): void {
    const file = this.selectedFile();
    if (!file) return;

    this.timesheetService.uploadExcel(file).subscribe({
      next: (res) => {
        if (res.dateRange) {
          this.customStartDate.set(res.dateRange.minDate);
          this.customEndDate.set(res.dateRange.maxDate);
        }
      },
    });
  }

  public loadSampleData(): void {
    this.timesheetService.loadSampleData().subscribe({
      next: (res) => {
        this.selectedFileName.set('sample_jira_timesheet.xlsx');
        if (res.dateRange) {
          this.customStartDate.set(res.dateRange.minDate);
          this.customEndDate.set(res.dateRange.maxDate);
        }
      },
    });
  }

  public selectFilterPreset(preset: DateFilterPreset): void {
    this.activeFilterPreset.set(preset);
    if (preset !== 'custom') {
      this.timesheetService.applyFilter({ preset });
    }
  }

  public applyCustomFilter(): void {
    this.activeFilterPreset.set('custom');
    this.timesheetService.applyFilter({
      preset: 'custom',
      startDate: this.customStartDate() || undefined,
      endDate: this.customEndDate() || undefined,
    });
  }

  public askQuestion(text?: string): void {
    const query = text || this.userQuestion();
    if (!query.trim()) return;

    this.timesheetService.askQuestion(query);
    if (!text) {
      this.userQuestion.set('');
    }
  }

  public toggleSource(messageId: string): void {
    this.expandedSources.update((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  }

  public isSourceExpanded(messageId: string): boolean {
    return !!this.expandedSources()[messageId];
  }

  private renderCharts(): void {
    const summary = this.timesheetService.analytics();
    if (!summary) return;

    this.renderMonthlyChart(summary);
    this.renderProjectChart(summary);
    this.renderTaskChart(summary);
    this.renderJiraChart(summary);
  }

  private renderMonthlyChart(summary: any): void {
    if (!this.monthlyCanvas?.nativeElement) return;
    if (this.monthlyChart) {
      this.monthlyChart.destroy();
    }

    const labels = summary.monthlyAllocation.map((m: any) => m.month);
    const data = summary.monthlyAllocation.map((m: any) => m.hours);

    const ctx = this.monthlyCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.monthlyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Hours Logged',
            data,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#2563eb',
            pointRadius: 4.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.parsed.y} hrs`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    });
  }

  private renderProjectChart(summary: any): void {
    if (!this.projectCanvas?.nativeElement) return;
    if (this.projectChart) {
      this.projectChart.destroy();
    }

    const labels = summary.projectAllocation.map((p: any) => p.project);
    const data = summary.projectAllocation.map((p: any) => p.hours);
    const percentages = summary.projectAllocation.map((p: any) => p.percentage);

    const colors = [
      '#3b82f6',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#ec4899',
      '#06b6d4',
      '#64748b',
    ];

    const ctx = this.projectCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.projectChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors.slice(0, labels.length),
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } },
          tooltip: {
            callbacks: {
              label: (context) => {
                const idx = context.dataIndex;
                const hours = context.parsed;
                const pct = percentages[idx] || 0;
                return ` ${context.label}: ${hours} hrs (${pct}%)`;
              },
            },
          },
        },
        cutout: '62%',
      },
    });
  }

  private renderTaskChart(summary: any): void {
    if (!this.taskCanvas?.nativeElement) return;
    if (this.taskChart) {
      this.taskChart.destroy();
    }

    const topTasks = summary.topTasks.slice(0, 5);
    const labels = topTasks.map((t: any) =>
      t.task.length > 22 ? t.task.slice(0, 20) + '...' : t.task
    );
    const data = topTasks.map((t: any) => t.hours);

    const ctx = this.taskCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.taskChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Hours',
            data,
            backgroundColor: '#10b981',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y', // horizontal bar chart
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.parsed.x} hrs`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
          y: {
            grid: { display: false },
          },
        },
      },
    });
  }

  private renderJiraChart(summary: any): void {
    if (!this.jiraCanvas?.nativeElement) return;
    if (this.jiraChart) {
      this.jiraChart.destroy();
    }

    const topJiras = summary.topJiraTickets.slice(0, 5);
    const labels = topJiras.map((j: any) => j.jira);
    const data = topJiras.map((j: any) => j.hours);

    const ctx = this.jiraCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.jiraChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Hours',
            data,
            backgroundColor: '#8b5cf6',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.parsed.y} hrs`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    });
  }
}
