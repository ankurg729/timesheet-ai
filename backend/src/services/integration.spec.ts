import { describe, it, expect } from 'vitest';
import { createSampleTimesheetBuffer } from '../utils/generate-sample-data.js';
import { excelService } from './excel.service.js';
import { analyticsService } from './analytics.service.js';
import { ragService } from './rag.service.js';
import { chromaService } from './chroma.service.js';

describe('End-to-End Timesheet Pipeline Integration', () => {
  const excelBuffer = createSampleTimesheetBuffer();
  const normalization = excelService.parseExcel(excelBuffer);

  it('should successfully parse and normalize the demo Excel timesheet', () => {
    expect(normalization.errors.length).toBe(0);
    expect(normalization.entries.length).toBeGreaterThan(15);
    expect(normalization.warnings.some((w) => w.includes('Deduplicated'))).toBe(true);
    expect(normalization.dateRange).toBeDefined();
  });

  it('should compute accurate analytics on the parsed dataset', () => {
    const summary = analyticsService.getAnalyticsSummary(normalization.entries);

    expect(summary.totalHours).toBeGreaterThan(100);
    expect(summary.totalProjects).toBeGreaterThanOrEqual(3);
    expect(summary.monthlyAllocation.length).toBeGreaterThanOrEqual(3);
    expect(summary.topTask).toBeDefined();
    expect(summary.topJiraTicket).toBeDefined();

    // Verify percentages sum to ~100%
    const totalProjectPct = summary.projectAllocation.reduce((sum, p) => sum + p.percentage, 0);
    expect(Math.round(totalProjectPct)).toBe(100);
  });

  it('should index entries into vector store and query semantic documents', async () => {
    const indexResult = await chromaService.indexEntries(normalization.entries);
    expect(indexResult.count).toBe(normalization.entries.length);

    // Query for skeleton loading
    const response = await ragService.handleChat(
      'What work did I perform on PAM-382?',
      normalization.entries
    );

    expect(response.questionType).toBe('rag');
    expect(response.sources.length).toBeGreaterThan(0);
    expect(response.sources.some((s) => s.jira === 'PAM-382')).toBe(true);
    expect(response.sources.some((s) => s.task.toLowerCase().includes('skeleton'))).toBe(true);
  });

  it('should handle hybrid questions with both numbers and sources', async () => {
    const response = await ragService.handleChat(
      'How many hours did I spend on PreAuth and what work did I perform?',
      normalization.entries
    );

    expect(response.questionType).toBe('hybrid');
    expect(response.sources.length).toBeGreaterThan(0);
    expect(response.answer).toBeDefined();
    expect(response.sources.some((s) => s.project === 'PreAuth' || s.jira.startsWith('PRE-'))).toBe(true);
  });

  it('should handle pure analytics questions correctly', async () => {
    const response = await ragService.handleChat(
      'What percentage of my time was spent on PAM?',
      normalization.entries
    );

    expect(response.questionType).toBe('analytics');
    expect(response.answer).toBeDefined();
  });
});
