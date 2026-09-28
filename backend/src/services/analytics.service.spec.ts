import { describe, it, expect } from 'vitest';
import { AnalyticsService } from './analytics.service.js';
import { TimesheetEntry } from '../types/timesheet.types.js';

describe('AnalyticsService', () => {
  const service = new AnalyticsService();

  const testEntries: TimesheetEntry[] = [
    {
      id: '1',
      date: '2026-06-10',
      jira: 'CORE-12',
      task: 'OAuth SSO Integration',
      description: 'Setup Okta SSO',
      comment: 'PKCE flow',
      hours: 10,
      project: 'Core',
    },
    {
      id: '2',
      date: '2026-07-05',
      jira: 'PRE-204',
      task: 'PreAuth Claim Verification',
      description: 'Rules engine',
      comment: 'CPT rules',
      hours: 16,
      project: 'PreAuth',
    },
    {
      id: '3',
      date: '2026-08-11',
      jira: 'PAM-382',
      task: 'Skeleton Loading',
      description: 'Shimmer cards',
      comment: 'Angular Signals',
      hours: 20,
      project: 'PAM',
    },
    {
      id: '4',
      date: '2026-08-20',
      jira: 'PAM-210',
      task: 'Timesheet Approval Workflow',
      description: 'Approval UI',
      comment: 'Review flow',
      hours: 14,
      project: 'PAM',
    },
    {
      id: '5',
      date: '2026-09-02',
      jira: 'PAM-382',
      task: 'Skeleton Loading',
      description: 'Fast 3G handling',
      comment: 'Debounce shimmer',
      hours: 4,
      project: 'PAM',
    },
  ];

  it('should calculate total hours correctly', () => {
    // 10 + 16 + 20 + 14 + 4 = 64
    const total = service.getTotalHours(testEntries);
    expect(total).toBe(64);
  });

  it('should calculate allocation percentage accurately', () => {
    // 38 hours for PAM out of 64 total = 59.375% -> 59.38%
    const pct = service.getAllocationPercentage(38, 64);
    expect(pct).toBe(59.38);

    // Edge cases
    expect(service.getAllocationPercentage(0, 100)).toBe(0);
    expect(service.getAllocationPercentage(50, 0)).toBe(0);
  });

  it('should compute monthly allocation sorted chronologically', () => {
    const monthly = service.getMonthlyAllocation(testEntries);
    expect(monthly.length).toBe(4);
    expect(monthly[0].month).toBe('2026-06');
    expect(monthly[0].hours).toBe(10);
    expect(monthly[1].month).toBe('2026-07');
    expect(monthly[1].hours).toBe(16);
    expect(monthly[2].month).toBe('2026-08');
    expect(monthly[2].hours).toBe(34);
    expect(monthly[3].month).toBe('2026-09');
    expect(monthly[3].hours).toBe(4);
  });

  it('should calculate project allocation descending by hours', () => {
    const projects = service.getProjectAllocation(testEntries);
    expect(projects[0].project).toBe('PAM');
    expect(projects[0].hours).toBe(38);
    expect(projects[0].percentage).toBe(59.38);

    expect(projects[1].project).toBe('PreAuth');
    expect(projects[1].hours).toBe(16);

    expect(projects[2].project).toBe('Core');
    expect(projects[2].hours).toBe(10);
  });

  it('should determine top task and top Jira ticket', () => {
    const topTasks = service.getTopTasks(testEntries, 1);
    expect(topTasks[0].task).toBe('Skeleton Loading');
    expect(topTasks[0].hours).toBe(24); // 20 + 4

    const topJira = service.getTopJiraTickets(testEntries, 1);
    expect(topJira[0].jira).toBe('PAM-382');
    expect(topJira[0].hours).toBe(24);
  });

  it('should filter entries by date range preset and custom range', () => {
    // Custom range: August only
    const augEntries = service.filterEntries(testEntries, {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    expect(augEntries.length).toBe(2);
    expect(service.getTotalHours(augEntries)).toBe(34);

    // Preset '30days' (relative to max date 2026-09-02: 30 days prior is around 2026-08-03)
    const recent = service.filterEntries(testEntries, { preset: '30days' });
    expect(recent.length).toBe(3); // Aug 11, Aug 20, Sep 02
  });

  it('should get hours for specific Jira ticket', () => {
    const pam382 = service.getHoursForJira(testEntries, 'PAM-382');
    expect(pam382.hours).toBe(24);
    expect(pam382.percentage).toBe(37.5);
  });

  it('should get hours for specific project', () => {
    const preAuth = service.getHoursForProject(testEntries, 'PreAuth');
    expect(preAuth.hours).toBe(16);
    expect(preAuth.percentage).toBe(25);
  });
});
