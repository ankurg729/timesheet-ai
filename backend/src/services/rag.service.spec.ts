import { describe, it, expect } from 'vitest';
import { RagService } from './rag.service.js';
import { TimesheetEntry } from '../types/timesheet.types.js';

describe('RagService - Question Classification & Routing', () => {
  const service = new RagService();

  const mockEntries: TimesheetEntry[] = [
    {
      id: '1',
      date: '2026-08-11',
      jira: 'PAM-382',
      task: 'Skeleton Loading',
      description: 'Shimmer cards',
      comment: 'Signals integration',
      hours: 7,
      project: 'PAM',
    },
    {
      id: '2',
      date: '2026-07-02',
      jira: 'PRE-204',
      task: 'PreAuth Claim Verification',
      description: 'Medical codes rules engine',
      comment: 'CPT codes',
      hours: 8,
      project: 'PreAuth',
    },
    {
      id: '3',
      date: '2026-06-15',
      jira: 'PROV-55',
      task: 'Provider Registration Flow',
      description: 'Registration wizard',
      comment: 'Form steps',
      hours: 8,
      project: 'Provider Registration',
    },
  ];

  it('should classify purely numerical/aggregation queries as "analytics"', () => {
    const questions = [
      'What was my total allocation in the last 3 months?',
      'Which Jira ticket consumed the most hours?',
      'What percentage of my time was spent on PAM?',
      'Show my monthly allocation.',
      'Which task consumed the most time?',
      'How many hours did I work?',
      'What was my allocation in August?',
    ];

    for (const q of questions) {
      const result = service.classifyQuestion(q, mockEntries);
      expect(result.type, `Question "${q}" should be classified as analytics`).toBe('analytics');
    }
  });

  it('should classify purely semantic/descriptive queries as "rag"', () => {
    const questions = [
      'What work did I perform on PAM-382?',
      'Summarize my Provider Registration work.',
      'What activities were related to PreAuth?',
      'Why did I spend time on skeleton loading?',
      'What did I work on during the skeleton loading task?',
    ];

    for (const q of questions) {
      const result = service.classifyQuestion(q, mockEntries);
      expect(result.type, `Question "${q}" should be classified as rag`).toBe('rag');
    }
  });

  it('should classify queries asking for both numbers and work description as "hybrid"', () => {
    const questions = [
      'How many hours did I spend on PreAuth and what work did I perform?',
      'Which project consumed most of my time and what type of work was involved?',
      'Compare my PreAuth and Provider Registration work.',
    ];

    for (const q of questions) {
      const result = service.classifyQuestion(q, mockEntries);
      expect(result.type, `Question "${q}" should be classified as hybrid`).toBe('hybrid');
    }
  });

  it('should extract target Jira ticket and Project filters from questions', () => {
    const q1 = 'What work did I perform on PAM-382?';
    const res1 = service.classifyQuestion(q1, mockEntries);
    expect(res1.suggestedFilters?.jira).toBe('PAM-382');

    const q2 = 'How many hours did I spend on PreAuth?';
    const res2 = service.classifyQuestion(q2, mockEntries);
    expect(res2.suggestedFilters?.project).toBe('PreAuth');
  });
});
