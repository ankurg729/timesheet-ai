import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { DateFilter, TimesheetEntry } from '../types/timesheet.types.js';
import { analyticsService } from '../services/analytics.service.js';
import { chromaService } from '../services/chroma.service.js';
import { excelService } from '../services/excel.service.js';
import { ragService } from '../services/rag.service.js';
import { embeddingService } from '../services/embedding.service.js';
import { aiService } from '../services/ai.service.js';

// In-memory application store for the active timesheet dataset
class TimesheetStore {
  public entries: TimesheetEntry[] = [];
  public currentFileName = '';
  public lastUploadTime: Date | null = null;
}

const store = new TimesheetStore();

export class TimesheetController {
  /**
   * POST /api/timesheet/upload
   * Handles Excel file upload, normalization, and vector indexing
   */
  public async uploadTimesheet(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: 'No file uploaded. Please upload a valid Excel file (.xlsx or .xls).',
        });
        return;
      }

      const fileName = req.file.originalname;
      const buffer = req.file.buffer;

      // Validate Excel file format
      const validExtensions = ['.xlsx', '.xls'];
      const fileExt = path.extname(fileName).toLowerCase();
      if (!validExtensions.includes(fileExt)) {
        res.status(400).json({
          success: false,
          message: `Invalid file extension "${fileExt}". Only .xlsx and .xls files are supported.`,
        });
        return;
      }

      // Parse and normalize
      const normalization = excelService.parseExcel(buffer);

      if (normalization.errors.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Failed to process Excel file due to validation errors.',
          errors: normalization.errors,
          warnings: normalization.warnings,
          totalRows: normalization.totalRows,
        });
        return;
      }

      if (normalization.entries.length === 0) {
        res.status(400).json({
          success: false,
          message: 'The uploaded Excel file contained no valid timesheet rows.',
          warnings: normalization.warnings,
        });
        return;
      }

      // Store entries in memory
      store.entries = normalization.entries;
      store.currentFileName = fileName;
      store.lastUploadTime = new Date();

      // Index in vector store asynchronously/await
      let indexResult = { count: 0, usedChroma: false };
      try {
        indexResult = await chromaService.indexEntries(store.entries);
      } catch (vectorErr: unknown) {
        console.warn('Vector indexing warning:', vectorErr);
      }

      // Calculate initial dashboard analytics
      const analytics = analyticsService.getAnalyticsSummary(store.entries);

      res.status(200).json({
        success: true,
        message: `Successfully processed ${normalization.validRows} timesheet entries.`,
        fileName,
        totalRows: normalization.totalRows,
        validRows: normalization.validRows,
        invalidRows: normalization.invalidRows,
        indexedCount: indexResult.count,
        usedChroma: indexResult.usedChroma,
        warnings: normalization.warnings,
        analytics,
        dateRange: normalization.dateRange,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        message: `Internal server error processing Excel upload: ${message}`,
      });
    }
  }

  /**
   * GET /api/timesheet/analytics
   * Returns computed structured analytics with optional date filter
   */
  public getAnalytics(req: Request, res: Response): void {
    if (store.entries.length === 0) {
      res.status(404).json({
        success: false,
        message: 'No timesheet uploaded yet. Please upload a timesheet first.',
      });
      return;
    }

    const filter: DateFilter = {
      preset: req.query.preset as any,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    };

    const summary = analyticsService.getAnalyticsSummary(store.entries, filter);

    res.status(200).json({
      success: true,
      data: summary,
      filterApplied: filter,
    });
  }

  /**
   * POST /api/timesheet/chat
   * Dispatches questions to Question Router -> Analytics / RAG / Hybrid -> AI synthesis
   */
  public async chat(req: Request, res: Response): Promise<void> {
    try {
      const { question, filter } = req.body;

      if (!question || typeof question !== 'string' || question.trim() === '') {
        res.status(400).json({
          success: false,
          message: 'Question cannot be empty.',
        });
        return;
      }

      if (store.entries.length === 0) {
        res.status(400).json({
          success: false,
          message: 'No timesheet data available. Please upload a Jira timesheet first.',
        });
        return;
      }

      const response = await ragService.handleChat(question, store.entries, filter);

      res.status(200).json({
        success: true,
        ...response,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        message: `Failed to answer question: ${message}`,
      });
    }
  }

  /**
   * POST /api/timesheet/reindex
   * Re-indexes current entries into ChromaDB
   */
  public async reindex(req: Request, res: Response): Promise<void> {
    try {
      if (store.entries.length === 0) {
        res.status(400).json({
          success: false,
          message: 'No timesheet data to index. Upload an Excel file first.',
        });
        return;
      }

      const result = await chromaService.indexEntries(store.entries);

      res.status(200).json({
        success: true,
        message: `Re-indexed ${result.count} entries.`,
        usedChroma: result.usedChroma,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        message: `Re-index failed: ${message}`,
      });
    }
  }

  /**
   * GET /api/timesheet/status
   * Provides current timesheet state, ChromaDB connectivity, and dataset metadata
   */
  public async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const chromaConnected = await chromaService.checkConnection();
      const collectionCount = await chromaService.getCount();
      const hasOpenAiKey = embeddingService.hasApiKey() && aiService.hasApiKey();

      const dates = store.entries.map((e) => e.date).sort();
      const sampleJiraTickets = Array.from(new Set(store.entries.map((e) => e.jira))).slice(0, 8);
      const sampleProjects = Array.from(
        new Set(store.entries.map((e) => e.project).filter(Boolean) as string[])
      );

      res.status(200).json({
        uploaded: store.entries.length > 0,
        fileName: store.currentFileName || undefined,
        totalEntries: store.entries.length,
        chromaConnected,
        collectionCount,
        hasOpenAiKey,
        dateRange:
          dates.length > 0
            ? {
                minDate: dates[0],
                maxDate: dates[dates.length - 1],
              }
            : undefined,
        sampleJiraTickets,
        sampleProjects,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        message: `Status check failed: ${message}`,
      });
    }
  }

  /**
   * POST /api/timesheet/load-sample
   * Loads sample Jira timesheet data for instant demo exploration
   */
  public async loadSampleData(req: Request, res: Response): Promise<void> {
    try {
      const samplePath = path.resolve(process.cwd(), '../test-data/sample_jira_timesheet.xlsx');

      let buffer: Buffer;
      if (fs.existsSync(samplePath)) {
        buffer = fs.readFileSync(samplePath);
      } else {
        // Fallback: generate buffer on the fly
        const { createSampleTimesheetBuffer } = await import('../utils/generate-sample-data.js');
        buffer = createSampleTimesheetBuffer();
      }

      const normalization = excelService.parseExcel(buffer);
      store.entries = normalization.entries;
      store.currentFileName = 'sample_jira_timesheet.xlsx';
      store.lastUploadTime = new Date();

      const indexResult = await chromaService.indexEntries(store.entries);
      const analytics = analyticsService.getAnalyticsSummary(store.entries);

      res.status(200).json({
        success: true,
        message: 'Sample timesheet data loaded successfully.',
        fileName: store.currentFileName,
        totalRows: normalization.totalRows,
        validRows: normalization.validRows,
        indexedCount: indexResult.count,
        usedChroma: indexResult.usedChroma,
        analytics,
        dateRange: normalization.dateRange,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        message: `Failed to load sample timesheet: ${message}`,
      });
    }
  }
}

export const timesheetController = new TimesheetController();
