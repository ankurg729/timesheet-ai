import { Router } from 'express';
import multer from 'multer';
import { timesheetController } from '../controllers/timesheet.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB max file size
  },
});

export const timesheetRouter = Router();

// REST Endpoints
timesheetRouter.post(
  '/upload',
  upload.single('file'),
  timesheetController.uploadTimesheet.bind(timesheetController)
);

timesheetRouter.get('/analytics', timesheetController.getAnalytics.bind(timesheetController));

timesheetRouter.post('/chat', timesheetController.chat.bind(timesheetController));

timesheetRouter.post('/reindex', timesheetController.reindex.bind(timesheetController));

timesheetRouter.get('/status', timesheetController.getStatus.bind(timesheetController));

timesheetRouter.post('/load-sample', timesheetController.loadSampleData.bind(timesheetController));
