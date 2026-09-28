import * as XLSX from 'xlsx';
import { NormalizationResult, TimesheetEntry } from '../types/timesheet.types.js';

export class ExcelService {
  /**
   * Column synonym mappings (normalized to lowercase, alphanumeric only)
   */
  private static readonly COLUMN_SYNONYMS: Record<string, string[]> = {
    date: [
      'date',
      'workdate',
      'logdate',
      'datelogged',
      'activitydate',
      'day',
      'started',
      'created',
      'loggeddate',
      'timestamp',
    ],
    jira: [
      'jira',
      'issuekey',
      'key',
      'ticket',
      'jiraticket',
      'issue',
      'issueid',
      'jirakey',
      'ticketid',
    ],
    task: [
      'task',
      'summary',
      'issuesummary',
      'activity',
      'title',
      'workitem',
      'taskname',
      'story',
      'item',
    ],
    description: [
      'description',
      'workdescription',
      'details',
      'taskdescription',
      'detail',
    ],
    comment: [
      'comment',
      'worklogcomment',
      'logcomment',
      'note',
      'worknote',
      'remarks',
      'comments',
      'notes',
    ],
    hours: [
      'hours',
      'timespent',
      'timespenth',
      'timespenthours',
      'duration',
      'durationh',
      'spenthours',
      'loggedhours',
      'hoursspent',
      'timespenthrs',
      'time',
      'spent',
    ],
    project: [
      'project',
      'projectname',
      'projectkey',
      'projectcode',
      'client',
    ],
    user: [
      'user',
      'author',
      'loggedby',
      'username',
      'assignee',
      'fullname',
      'worker',
      'member',
      'employee',
    ],
  };

  /**
   * Parse an Excel buffer and normalize its rows into TimesheetEntry records
   */
  public parseExcel(buffer: Buffer): NormalizationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const entries: TimesheetEntry[] = [];
    const seenSignatures = new Set<string>();

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: true,
        dateNF: 'yyyy-mm-dd',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read Excel file: ${message}`);
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        entries: [],
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warnings: ['Workbook contains no worksheets'],
        errors: ['Empty workbook'],
      };
    }

    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      return {
        entries: [],
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warnings: [`Sheet "${firstSheetName}" is missing or unreadable`],
        errors: ['Unreadable sheet'],
      };
    }

    // Convert sheet to array of rows (first row is header)
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false,
      dateNF: 'yyyy-mm-dd',
      defval: '',
    });

    if (!rawData || rawData.length === 0) {
      return {
        entries: [],
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warnings: ['Worksheet is empty or has no data rows'],
        errors: ['No data rows found in worksheet'],
      };
    }

    // Build column map from header row
    const firstRow = rawData[0];
    const originalHeaders = Object.keys(firstRow);
    const columnMap = this.mapHeaders(originalHeaders);

    // Verify minimum required columns: date, hours, and at least one of (jira, task)
    if (!columnMap.date) {
      errors.push('Missing required column: "Date" (or equivalent)');
    }
    if (!columnMap.hours) {
      errors.push('Missing required column: "Hours" or "Time Spent" (or equivalent)');
    }
    if (!columnMap.jira && !columnMap.task) {
      errors.push('Missing both "Jira" and "Task" columns. At least one must be present.');
    }

    if (errors.length > 0) {
      return {
        entries: [],
        totalRows: rawData.length,
        validRows: 0,
        invalidRows: rawData.length,
        warnings,
        errors,
      };
    }

    let minDate: string | null = null;
    let maxDate: string | null = null;
    let duplicateCount = 0;
    let invalidRowCount = 0;

    for (let index = 0; index < rawData.length; index++) {
      const row = rawData[index];
      const rowNumber = index + 2; // Accounting for 1-based index and header row

      // Check if row is completely empty
      const isCompletelyEmpty = Object.values(row).every(
        (val) => val === '' || val === null || val === undefined
      );
      if (isCompletelyEmpty) {
        continue; // skip blank row silently
      }

      // Parse date
      const rawDateVal = columnMap.date ? row[columnMap.date] : null;
      const parsedDate = this.normalizeDate(rawDateVal);
      if (!parsedDate) {
        warnings.push(`Row ${rowNumber}: Skipped due to invalid date value: "${rawDateVal}"`);
        invalidRowCount++;
        continue;
      }

      // Parse hours
      const rawHoursVal = columnMap.hours ? row[columnMap.hours] : null;
      const parsedHours = this.normalizeHours(rawHoursVal);
      if (parsedHours === null || parsedHours <= 0) {
        warnings.push(
          `Row ${rowNumber}: Skipped due to invalid hours value: "${rawHoursVal}" (must be > 0)`
        );
        invalidRowCount++;
        continue;
      }

      // Extract Jira
      const rawJira = columnMap.jira ? String(row[columnMap.jira] || '').trim() : '';
      // Extract Task
      const rawTask = columnMap.task ? String(row[columnMap.task] || '').trim() : '';

      // If both Jira and Task are blank, row lacks identifiable ticket/task
      if (!rawJira && !rawTask) {
        warnings.push(`Row ${rowNumber}: Skipped because both Jira ticket and Task name are blank`);
        invalidRowCount++;
        continue;
      }

      const jira = rawJira || 'NO-TICKET';
      const task = rawTask || (jira !== 'NO-TICKET' ? jira : 'General Task');

      // Description & Comment
      const description = columnMap.description ? String(row[columnMap.description] || '').trim() : '';
      const comment = columnMap.comment ? String(row[columnMap.comment] || '').trim() : '';

      // Project: if not explicitly present, deduce from Jira ticket key prefix (e.g. PAM from PAM-382)
      let project: string | undefined = columnMap.project ? String(row[columnMap.project] || '').trim() : undefined;
      if (!project && jira && jira.includes('-')) {
        const prefix = jira.split('-')[0].trim();
        if (prefix && prefix !== 'NO') {
          project = prefix;
        }
      }
      if (!project) {
        project = 'General';
      }

      // User
      const user = columnMap.user ? String(row[columnMap.user] || '').trim() : undefined;

      // Deduplication signature
      const signature = `${parsedDate}|${jira.toUpperCase()}|${task.toLowerCase()}|${parsedHours}|${comment.toLowerCase()}|${(user || '').toLowerCase()}`;
      if (seenSignatures.has(signature)) {
        duplicateCount++;
        continue; // skip duplicate row
      }
      seenSignatures.add(signature);

      // Track min/max dates
      if (!minDate || parsedDate < minDate) minDate = parsedDate;
      if (!maxDate || parsedDate > maxDate) maxDate = parsedDate;

      const entry: TimesheetEntry = {
        id: `ts_${index + 1}_${Math.random().toString(36).substring(2, 8)}`,
        date: parsedDate,
        jira,
        task,
        description,
        comment,
        hours: Math.round(parsedHours * 100) / 100,
        project,
        user: user || undefined,
      };

      entries.push(entry);
    }

    if (duplicateCount > 0) {
      warnings.push(`Deduplicated ${duplicateCount} duplicate rows.`);
    }

    // Sort entries chronologically by date
    entries.sort((a, b) => a.date.localeCompare(b.date));

    return {
      entries,
      totalRows: rawData.length,
      validRows: entries.length,
      invalidRows: invalidRowCount,
      warnings,
      errors,
      dateRange: minDate && maxDate ? { minDate, maxDate } : undefined,
    };
  }

  /**
   * Maps table headers to canonical column keys using fuzzy synonym matching
   */
  public mapHeaders(headers: string[]): Record<string, string> {
    const result: Record<string, string> = {};

    for (const header of headers) {
      const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');

      for (const [canonicalKey, synonyms] of Object.entries(ExcelService.COLUMN_SYNONYMS)) {
        if (!result[canonicalKey]) {
          for (const syn of synonyms) {
            if (cleanHeader === syn || cleanHeader.includes(syn)) {
              result[canonicalKey] = header;
              break;
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Normalizes a raw date value into ISO YYYY-MM-DD
   */
  public normalizeDate(val: unknown): string | null {
    if (val === null || val === undefined || val === '') {
      return null;
    }

    // If already Date object
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      return val.toISOString().slice(0, 10);
    }

    // If number (Excel serial date)
    if (typeof val === 'number') {
      if (val < 1 || isNaN(val)) return null;
      // Excel 1900 date system (accounting for 1900 leap year bug)
      const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (isNaN(jsDate.getTime())) return null;
      return jsDate.toISOString().slice(0, 10);
    }

    const str = String(val).trim();

    // Check if numeric string serial
    if (/^\d{5}$/.test(str)) {
      const num = parseInt(str, 10);
      const jsDate = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(jsDate.getTime())) {
        return jsDate.toISOString().slice(0, 10);
      }
    }

    // Match YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (isoMatch) {
      const year = isoMatch[1];
      const month = isoMatch[2].padStart(2, '0');
      const day = isoMatch[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Match DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      // Basic sanity check: if first number > 12, it is definitely day
      const firstNum = parseInt(day, 10);
      const secondNum = parseInt(month, 10);
      if (firstNum > 12 && secondNum <= 12) {
        return `${year}-${month}-${day}`;
      } else if (secondNum > 12 && firstNum <= 12) {
        // MM/DD/YYYY format
        return `${year}-${day}-${month}`;
      }
      return `${year}-${month}-${day}`;
    }

    // Match Month name formats: 12-Aug-2026, Aug 12 2026, 12 August 2026
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      if (year >= 1990 && year <= 2100) {
        return parsed.toISOString().slice(0, 10);
      }
    }

    return null;
  }

  /**
   * Normalizes hours input into a floating point number
   * Supports: 7.5, "7.5", "7.5h", "7h 30m", "1d 2h", "07:30"
   */
  public normalizeHours(val: unknown): number | null {
    if (val === null || val === undefined || val === '') {
      return null;
    }

    if (typeof val === 'number') {
      return isNaN(val) || val <= 0 ? null : val;
    }

    let str = String(val).trim().toLowerCase();

    // Check for HH:MM format like "07:30"
    const timeMatch = str.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      return h + m / 60;
    }

    // Check for Jira format like "1d 2h 30m" or "4h 30m" or "45m"
    if (/[dhm]/.test(str)) {
      let totalHours = 0;
      let matched = false;

      const days = str.match(/(\d+(?:\.\d+)?)\s*d/);
      if (days) {
        totalHours += parseFloat(days[1]) * 8; // standard Jira 8h/day
        matched = true;
      }

      const hours = str.match(/(\d+(?:\.\d+)?)\s*h/);
      if (hours) {
        totalHours += parseFloat(hours[1]);
        matched = true;
      }

      const mins = str.match(/(\d+(?:\.\d+)?)\s*m(?:in)?/);
      if (mins) {
        totalHours += parseFloat(mins[1]) / 60;
        matched = true;
      }

      if (matched && totalHours > 0) {
        return totalHours;
      }
    }

    // Remove any trailing 'h', 'hrs', 'hours'
    str = str.replace(/[^\d.-]/g, '');
    const num = parseFloat(str);

    if (isNaN(num) || num <= 0) {
      return null;
    }

    return num;
  }
}

export const excelService = new ExcelService();
