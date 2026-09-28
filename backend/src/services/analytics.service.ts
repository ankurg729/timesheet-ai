import {
  AnalyticsSummary,
  DateFilter,
  MonthlyAllocation,
  TimesheetEntry,
} from '../types/timesheet.types.js';

export class AnalyticsService {
  /**
   * Filter timesheet entries by date criteria
   */
  public filterEntries(entries: TimesheetEntry[], filter?: DateFilter): TimesheetEntry[] {
    if (!filter || (!filter.preset && !filter.startDate && !filter.endDate)) {
      return entries;
    }

    if (entries.length === 0) {
      return [];
    }

    // Determine reference date: use the latest date present in the dataset
    // (This ensures historical datasets work reliably with "last 30 days / 3 months")
    const dates = entries.map((e) => e.date).sort();
    const maxDateStr = dates[dates.length - 1];
    const maxDate = new Date(maxDateStr + 'T23:59:59Z');

    let startDateStr = filter.startDate;
    let endDateStr = filter.endDate;

    if (filter.preset) {
      switch (filter.preset) {
        case '30days': {
          const past = new Date(maxDate);
          past.setDate(past.getDate() - 30);
          startDateStr = past.toISOString().slice(0, 10);
          endDateStr = maxDateStr;
          break;
        }
        case '3months': {
          const past = new Date(maxDate);
          past.setMonth(past.getMonth() - 3);
          startDateStr = past.toISOString().slice(0, 10);
          endDateStr = maxDateStr;
          break;
        }
        case '6months': {
          const past = new Date(maxDate);
          past.setMonth(past.getMonth() - 6);
          startDateStr = past.toISOString().slice(0, 10);
          endDateStr = maxDateStr;
          break;
        }
        case 'all':
        default:
          break;
      }
    }

    return entries.filter((entry) => {
      if (startDateStr && entry.date < startDateStr) {
        return false;
      }
      if (endDateStr && entry.date > endDateStr) {
        return false;
      }
      return true;
    });
  }

  /**
   * Calculate total hours across given entries
   */
  public getTotalHours(entries: TimesheetEntry[]): number {
    const total = entries.reduce((sum, item) => sum + (item.hours || 0), 0);
    return Math.round(total * 100) / 100;
  }

  /**
   * Calculate allocation percentage with 2 decimal precision
   */
  public getAllocationPercentage(partHours: number, totalHours: number): number {
    if (totalHours <= 0 || partHours <= 0) {
      return 0;
    }
    return Math.round((partHours / totalHours) * 10000) / 100;
  }

  /**
   * Monthly allocation sorted chronologically
   */
  public getMonthlyAllocation(entries: TimesheetEntry[]): MonthlyAllocation[] {
    const totalHours = this.getTotalHours(entries);
    const monthMap = new Map<string, number>();

    for (const entry of entries) {
      // YYYY-MM
      const month = entry.date.slice(0, 7);
      monthMap.set(month, (monthMap.get(month) || 0) + entry.hours);
    }

    const sortedMonths = Array.from(monthMap.keys()).sort();

    return sortedMonths.map((month) => {
      const hours = Math.round((monthMap.get(month) || 0) * 100) / 100;
      return {
        month,
        hours,
        percentage: this.getAllocationPercentage(hours, totalHours),
      };
    });
  }

  /**
   * Project allocation sorted by hours descending
   */
  public getProjectAllocation(
    entries: TimesheetEntry[]
  ): Array<{ project: string; hours: number; percentage: number }> {
    const totalHours = this.getTotalHours(entries);
    const map = new Map<string, number>();

    for (const entry of entries) {
      const key = entry.project?.trim() || 'General';
      map.set(key, (map.get(key) || 0) + entry.hours);
    }

    return Array.from(map.entries())
      .map(([project, hours]) => {
        const roundedHours = Math.round(hours * 100) / 100;
        return {
          project,
          hours: roundedHours,
          percentage: this.getAllocationPercentage(roundedHours, totalHours),
        };
      })
      .sort((a, b) => b.hours - a.hours);
  }

  /**
   * Jira allocation sorted by hours descending
   */
  public getJiraAllocation(
    entries: TimesheetEntry[]
  ): Array<{ jira: string; hours: number; percentage: number }> {
    const totalHours = this.getTotalHours(entries);
    const map = new Map<string, number>();

    for (const entry of entries) {
      const key = entry.jira?.trim().toUpperCase() || 'NO-TICKET';
      map.set(key, (map.get(key) || 0) + entry.hours);
    }

    return Array.from(map.entries())
      .map(([jira, hours]) => {
        const roundedHours = Math.round(hours * 100) / 100;
        return {
          jira,
          hours: roundedHours,
          percentage: this.getAllocationPercentage(roundedHours, totalHours),
        };
      })
      .sort((a, b) => b.hours - a.hours);
  }

  /**
   * Task allocation sorted by hours descending
   */
  public getTaskAllocation(
    entries: TimesheetEntry[]
  ): Array<{ task: string; hours: number; percentage: number }> {
    const totalHours = this.getTotalHours(entries);
    const map = new Map<string, { displayName: string; hours: number }>();

    for (const entry of entries) {
      const displayName = entry.task?.trim() || 'General Task';
      const normalizedKey = displayName.toLowerCase();
      const existing = map.get(normalizedKey);
      if (existing) {
        existing.hours += entry.hours;
      } else {
        map.set(normalizedKey, { displayName, hours: entry.hours });
      }
    }

    return Array.from(map.values())
      .map(({ displayName, hours }) => {
        const roundedHours = Math.round(hours * 100) / 100;
        return {
          task: displayName,
          hours: roundedHours,
          percentage: this.getAllocationPercentage(roundedHours, totalHours),
        };
      })
      .sort((a, b) => b.hours - a.hours);
  }

  /**
   * Top N tasks by hours
   */
  public getTopTasks(
    entries: TimesheetEntry[],
    limit = 5
  ): Array<{ task: string; hours: number; percentage: number }> {
    return this.getTaskAllocation(entries).slice(0, limit);
  }

  /**
   * Top N Jira tickets by hours
   */
  public getTopJiraTickets(
    entries: TimesheetEntry[],
    limit = 5
  ): Array<{ jira: string; hours: number; percentage: number }> {
    return this.getJiraAllocation(entries).slice(0, limit);
  }

  /**
   * Compute full dashboard summary with date filter applied
   */
  public getAnalyticsSummary(entries: TimesheetEntry[], filter?: DateFilter): AnalyticsSummary {
    const filtered = this.filterEntries(entries, filter);
    const totalHours = this.getTotalHours(filtered);

    const projectAllocation = this.getProjectAllocation(filtered);
    const jiraAllocation = this.getJiraAllocation(filtered);
    const taskAllocation = this.getTaskAllocation(filtered);
    const monthlyAllocation = this.getMonthlyAllocation(filtered);
    const topTasks = this.getTopTasks(filtered, 5);
    const topJiraTickets = this.getTopJiraTickets(filtered, 5);

    const dates = filtered.map((e) => e.date).sort();

    return {
      totalHours,
      totalEntries: filtered.length,
      totalProjects: projectAllocation.length,
      totalJiraTickets: jiraAllocation.length,
      topTask: topTasks.length > 0 ? topTasks[0] : null,
      topJiraTicket: topJiraTickets.length > 0 ? topJiraTickets[0] : null,
      monthlyAllocation,
      projectAllocation,
      jiraAllocation,
      taskAllocation,
      topTasks,
      topJiraTickets,
      dateRange:
        dates.length > 0
          ? {
              minDate: dates[0],
              maxDate: dates[dates.length - 1],
            }
          : undefined,
    };
  }

  /**
   * Query hours and percentage specifically for a Jira ticket key
   */
  public getHoursForJira(
    entries: TimesheetEntry[],
    jiraKey: string
  ): { jira: string; hours: number; percentage: number; entries: TimesheetEntry[] } {
    const normalizedKey = jiraKey.trim().toUpperCase();
    const matched = entries.filter((e) => e.jira.toUpperCase() === normalizedKey);
    const totalHours = this.getTotalHours(entries);
    const ticketHours = this.getTotalHours(matched);

    return {
      jira: jiraKey,
      hours: ticketHours,
      percentage: this.getAllocationPercentage(ticketHours, totalHours),
      entries: matched,
    };
  }

  /**
   * Query hours and percentage specifically for a project
   */
  public getHoursForProject(
    entries: TimesheetEntry[],
    projectName: string
  ): { project: string; hours: number; percentage: number; entries: TimesheetEntry[] } {
    const target = projectName.trim().toLowerCase();
    const matched = entries.filter((e) => (e.project || '').toLowerCase().includes(target));
    const totalHours = this.getTotalHours(entries);
    const projectHours = this.getTotalHours(matched);

    return {
      project: projectName,
      hours: projectHours,
      percentage: this.getAllocationPercentage(projectHours, totalHours),
      entries: matched,
    };
  }

  /**
   * Query hours and percentage specifically for a task keyword
   */
  public getHoursForTask(
    entries: TimesheetEntry[],
    taskKeyword: string
  ): { task: string; hours: number; percentage: number; entries: TimesheetEntry[] } {
    const target = taskKeyword.trim().toLowerCase();
    const matched = entries.filter((e) => (e.task || '').toLowerCase().includes(target));
    const totalHours = this.getTotalHours(entries);
    const taskHours = this.getTotalHours(matched);

    return {
      task: taskKeyword,
      hours: taskHours,
      percentage: this.getAllocationPercentage(taskHours, totalHours),
      entries: matched,
    };
  }
}

export const analyticsService = new AnalyticsService();
