import './config/env.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { timesheetRouter } from './routes/timesheet.routes.js';
import { chromaService } from './services/chroma.service.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    origin: ['http://localhost:4200', 'http://127.0.0.1:4200', 'http://localhost:3000'],
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Timesheet API routes
app.use('/api/timesheet', timesheetRouter);

// Global Error Handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Application Error:', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({
    success: false,
    message,
  });
});

// Start Server
const server = app.listen(PORT, async () => {
  console.log(`=================================================`);
  console.log(` AI Timesheet Analytics & RAG Assistant Backend`);
  console.log(` Server running on: http://localhost:${PORT}`);
  console.log(` OpenAI Chat Model: ${process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'}`);
  console.log(` OpenAI Embedding Model: ${process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'}`);
  console.log(` ChromaDB Endpoint: ${process.env.CHROMA_URL || 'http://localhost:8000'}`);
  console.log(`=================================================`);

  // Check ChromaDB connectivity on startup
  const chromaOk = await chromaService.checkConnection();
  if (chromaOk) {
    console.log('ChromaDB connection verified successfully.');
  } else {
    console.log('ChromaDB not currently connected. Using in-memory vector storage fallback.');
    console.log('To start ChromaDB in Docker, run: docker compose up -d');
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[Backend Error] Port ${PORT} is already in use by another process.`);
    console.error(`To fix this:`);
    console.error(`  - Kill the process holding port ${PORT}: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force`);
    console.error(`  - Or set a different PORT in .env (e.g. PORT=3001)\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
  }
});
