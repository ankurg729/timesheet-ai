import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { ExcelService } from './excel.service.js';

describe('ExcelService - Normalization Layer', () => {
  const service = new ExcelService();

  it('should map headers with varying names and synonyms', () => {
    const headers = [
      'Work Date',
      'Issue Key',
      'Task Summary',
      'Hours Spent',
      'Work Description',
      'Worklog Comment',
      'Project Name',
      'Logged By',
    ];

    const mapped = service.mapHeaders(headers);
    expect(mapped.date).toBe('Work Date');
    expect(mapped.jira).toBe('Issue Key');
    expect(mapped.task).toBe('Task Summary');
    expect(mapped.hours).toBe('Hours Spent');
    expect(mapped.description).toBe('Work Description');
    expect(mapped.comment).toBe('Worklog Comment');
    expect(mapped.project).toBe('Project Name');
    expect(mapped.user).toBe('Logged By');
  });

  it('should normalize various date formats correctly', () => {
    // ISO format
    expect(service.normalizeDate('2026-08-12')).toBe('2026-08-12');
    // DD/MM/YYYY
    expect(service.normalizeDate('25/08/2026')).toBe('2026-08-25');
    // JS Date
    expect(service.normalizeDate(new Date('2026-08-12T00:00:00Z'))).toBe('2026-08-12');
    // Invalid date
    expect(service.normalizeDate('invalid-date-string')).toBeNull();
    expect(service.normalizeDate('')).toBeNull();
  });

  it('should normalize various hour formats correctly', () => {
    // Numeric
    expect(service.normalizeHours(7.5)).toBe(7.5);
    // String number
    expect(service.normalizeHours('7.5')).toBe(7.5);
    // String with 'h'
    expect(service.normalizeHours('8h')).toBe(8);
    // Jira format 1d 2h (1d = 8h => 10h)
    expect(service.normalizeHours('1d 2h')).toBe(10);
    // Jira format 4h 30m => 4.5h
    expect(service.normalizeHours('4h 30m')).toBe(4.5);
    // Time format "07:30" => 7.5
    expect(service.normalizeHours('07:30')).toBe(7.5);
    // Invalid / zero hours
    expect(service.normalizeHours(0)).toBeNull();
    expect(service.normalizeHours(-5)).toBeNull();
    expect(service.normalizeHours('abc')).toBeNull();
    expect(service.normalizeHours('')).toBeNull();
  });

  it('should parse an Excel buffer, deduplicate rows, and return valid records', () => {
    const rawRows = [
      {
        'Log Date': '2026-08-12',
        'Ticket': 'PAM-382',
        'Activity': 'Skeleton Loading',
        'Time': '7h',
        'Project': 'PAM',
        'Notes': 'Shimmer effect for cards',
      },
      {
        'Log Date': '2026-08-13',
        'Ticket': 'PAM-382',
        'Activity': 'Skeleton Loading',
        'Time': '6',
        'Project': 'PAM',
        'Notes': 'Signals integration',
      },
      // Duplicate of previous row
      {
        'Log Date': '2026-08-13',
        'Ticket': 'PAM-382',
        'Activity': 'Skeleton Loading',
        'Time': '6',
        'Project': 'PAM',
        'Notes': 'Signals integration',
      },
      // Invalid hours row
      {
        'Log Date': '2026-08-14',
        'Ticket': 'PAM-101',
        'Activity': 'Permissions',
        'Time': '-5',
        'Project': 'PAM',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(rawRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = service.parseExcel(buffer);

    expect(result.errors.length).toBe(0);
    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(1); // negative hours row
    expect(result.warnings.some((w) => w.includes('Deduplicated 1 duplicate'))).toBe(true);
    expect(result.entries[0].jira).toBe('PAM-382');
    expect(result.entries[0].hours).toBe(7);
    expect(result.entries[1].hours).toBe(6);
  });

  it('should return errors when mandatory columns are missing', () => {
    const invalidRows = [{ 'User Name': 'Alex', 'Random Column': 'Data' }];

    const ws = XLSX.utils.json_to_sheet(invalidRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = service.parseExcel(buffer);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('Missing required column'))).toBe(true);
    expect(result.validRows).toBe(0);
  });
});
