# AI Timesheet Analytics & RAG Assistant

A full-stack, enterprise-grade AI Timesheet Assistant combining **Structured Data Analytics**, **Semantic RAG (Retrieval-Augmented Generation)**, **ChromaDB Vector Database**, and **OpenAI GPT Models**, wrapped in a responsive **Angular 19 dashboard** with real-time Chart.js visualizations and ChatGPT-style interface.

---

## Architecture Diagram

```text
                                  +-----------------------------+
                                  |   Jira Timesheet Excel      |
                                  |       (.xlsx / .xls)        |
                                  +--------------+--------------+
                                                 |
                                                 v
                                  +-----------------------------+
                                  |    Excel Normalization      |
                                  |  - Flexible header synonym  |
                                  |  - Date & hours parser      |
                                  |  - Deduplication & filters  |
                                  +--------------+--------------+
                                                 |
                                                 v
                                  +-----------------------------+
                                  |  Structured Timesheet Data  |
                                  +------+---------------+------+
                                         |               |
                         +---------------+               +---------------+
                         |                                               |
                         v                                               v
          +-------------------------------+               +-------------------------------+
          |       Analytics Engine        |               |         RAG Pipeline          |
          |  - Total / Monthly Hours      |               |  - Standardized Doc Creator   |
          |  - Project / Ticket Shares    |               |  - OpenAI / Local Embeddings  |
          |  - Top Tasks & Jira Tickets   |               |  - ChromaDB Vector Collection |
          |  - Strict TS Math (No LLM)    |               |  - Cosine Top-K Retrieval     |
          +---------------+---------------+               +---------------+---------------+
                          |                                               |
                          +---------------+               +---------------+
                                          |               |
                                          v               v
                                  +-----------------------------+
                                  |       Question Router       |
                                  |  - Regex & intent classifier|
                                  |  - Entity extraction (Jira) |
                                  +--------------+--------------+
                                                 |
                   +-----------------------------+-----------------------------+
                   |                             |                             |
                   v                             v                             v
           [Analytics Route]                [RAG Route]                 [Hybrid Route]
         Calculates aggregates           Queries ChromaDB          Computes analytics AND
         via deterministic TS            for semantic logs         retrieves vector logs
                   |                             |                             |
                   +-----------------------------+-----------------------------+
                                                 |
                                                 v
                                  +-----------------------------+
                                  |  Prompt Context Synthesizer |
                                  |  (No raw file dumping)      |
                                  +--------------+--------------+
                                                 |
                                                 v
                                  +-----------------------------+
                                  |    OpenAI GPT Completion    |
                                  |  - Zero-hallucination prompt|
                                  |  - Configurable model       |
                                  +--------------+--------------+
                                                 |
                                                 v
                                  +-----------------------------+
                                  |  Answer + Cited Sources UI  |
                                  |  - Formatted text           |
                                  |  - Jira, task, hours, date  |
                                  +-----------------------------+
```

---

## 1. Project Overview

Organizations rely on Jira worklogs for billing, resource planning, and project management. However, teams struggle with:
1. **Numerical questions** ("How many hours were billed to PAM in August?", "What was my monthly allocation?") which raw LLMs notoriously miscalculate or hallucinate.
2. **Semantic questions** ("What work was done on skeleton loading?", "Summarize our PreAuth claim integration") which standard SQL or spreadsheet formulas cannot answer.
3. **Hybrid questions** ("How much time was spent on PreAuth and what technical challenges were addressed?") requiring both deterministic arithmetic and contextual understanding.

**AI Timesheet Analytics & RAG Assistant** solves this with an architectural separation of concerns:
- **Never ask LLMs to do math or compute percentages.** Deterministic TypeScript algorithms calculate exact figures.
- **Never dump the entire spreadsheet into LLM context.** Only top-K relevant vector matches and calculated summaries are passed.
- **Question Router automatically dispatches** user queries to Structured Analytics, Vector RAG, or Hybrid pipelines.

---

## 2. Tech Stack

### Frontend
- **Angular 19** (Standalone Components, modern signals `signal()` and `computed()`, `provideHttpClient(withFetch())`)
- **TypeScript** (Strict mode)
- **Chart.js** (Interactive Line chart for monthly trends, Doughnut chart for project share, Bar charts for top tasks & tickets)
- **SCSS Design System** (Responsive desktop 2-panel / mobile single-column layout, badges, citation cards)

### Backend
- **Node.js 22 & Express** (ES Modules, TypeScript, REST APIs)
- **Multer** (In-memory Excel file upload)
- **XLSX** (Flexible spreadsheet parser and normalizer)
- **OpenAI Node SDK** (`text-embedding-3-small` for embeddings, configurable GPT chat model)
- **ChromaDB** (`jira-timesheet` collection, with high-performance in-memory fallback)
- **Vitest** (Fast unit & integration testing suite)

---

## 3. Prerequisites

- **Node.js**: v20+ or v22+
- **npm**: v9+
- **Docker & Docker Compose** (Optional for ChromaDB; the system includes an in-memory vector fallback if Docker is offline)
- **OpenAI API Key** (Optional for local test runs; includes an offline template generator)

---

## 4. Installation

Clone or navigate to the workspace root:

```bash
cd D:\timesheet-ai
```

Install root, backend, and frontend dependencies:

```bash
npm install
```

---

## 5. Environment Variables

Create `.env` in the root and backend folders (or copy from `.env.example`):

```bash
cp .env.example .env
```

`.env` configuration options:

```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
CHROMA_URL=http://localhost:8000
```

> **Security Note:** `.env` is listed in `.gitignore` and is never exposed to the Angular client. The Angular frontend communicates with the backend solely through REST endpoints.

---

## 6. Running ChromaDB

Start ChromaDB using Docker Compose:

```bash
docker compose up -d
```

To stop ChromaDB:

```bash
docker compose down
```

*Note: If Docker is not running, the application automatically switches to an in-memory vector index fallback with zero downtime.*

---

## 7. Running Backend & Frontend

### Quick Start (Both concurrently):

```bash
npm run dev
```

### Or Start Independently:

**Terminal 1 (Backend on `http://localhost:3000`):**
```bash
npm run dev:backend
```

**Terminal 2 (Frontend on `http://localhost:4200`):**
```bash
npm run dev:frontend
```

Open `http://localhost:4200` in your browser.

---

## 8. Excel Input & Normalization Layer

The application does not depend on a rigid column naming schema. Common synonyms are automatically mapped:

| Canonical Key | Supported Column Synonyms |
| :--- | :--- |
| **Date** | `Date`, `Work Date`, `Log Date`, `Created`, `Started`, `Activity Date`, `Day` |
| **Jira** | `Issue Key`, `Key`, `Jira`, `Ticket`, `Jira Ticket`, `Issue ID`, `Jira Key` |
| **Task** | `Summary`, `Task`, `Task Summary`, `Issue Summary`, `Activity`, `Title`, `Story` |
| **Hours** | `Hours`, `Time Spent (h)`, `Duration (h)`, `Spent Hours`, `Logged Hours`, `Time` |
| **Description**| `Description`, `Work Description`, `Details`, `Task Description` |
| **Comment** | `Comment`, `Worklog Comment`, `Log Comment`, `Note`, `Work Note`, `Remarks` |
| **Project** | `Project`, `Project Name`, `Project Key`, `Client` |
| **User** | `User`, `Author`, `Logged By`, `Username`, `Assignee`, `Full Name` |

### Handles:
- **Serial dates & formats**: Excel 1900 date serials, ISO (`YYYY-MM-DD`), European (`DD/MM/YYYY`), US (`MM/DD/YYYY`).
- **Flexible hour strings**: `7.5`, `"7.5h"`, `"1d 2h"` (1d = 8h Jira standard), `"4h 30m"`, `"07:30"`.
- **Deduplication**: Automatic detection and skipping of duplicate worklogs based on composite signature.
- **Empty & invalid rows**: Gracefully warns and skips invalid rows without aborting the entire file.

---

## 9. RAG Implementation Details

### ChromaDB Collection
- Name: `jira-timesheet`
- Distance metric: Cosine similarity (`hnsw:space: "cosine"`)

### Document Representation
Each timesheet record is structured into a normalized document before embedding:

```text
Jira Ticket: PAM-382
Task: Skeleton Loading
Date: 2026-08-11
Hours: 7
Project: PAM
Description: Implemented shimmer effect and skeleton screen loading for timesheet cards to improve perceived performance
Comment: Created animated CSS shimmer gradients for card placeholders
```

### Metadata
```json
{
  "jira": "PAM-382",
  "task": "Skeleton Loading",
  "date": "2026-08-11",
  "hours": 7,
  "project": "PAM"
}
```

---

## 10. Analytics vs. RAG vs. Hybrid

| Category | Query Goal | Pipeline Used | Reason |
| :--- | :--- | :--- | :--- |
| **Analytics** | Aggregations, percentages, top tickets, sums | TypeScript Analytics Service | Math is deterministic; LLMs hallucinate calculations |
| **RAG** | Work summaries, activity descriptions, code details | Embedding + ChromaDB + OpenAI | Semantic similarity finds relevant worklog entries |
| **Hybrid** | Quantitative context + descriptive work | TS Analytics + Vector RAG + OpenAI | Combines accurate metrics with qualitative technical context |

---

## 11. Example Questions

### 📊 Structured Analytics
- *"What was my total allocation in the last 3 months?"*
- *"Which Jira ticket consumed the most hours?"*
- *"What percentage of my time was spent on PAM?"*
- *"Show my monthly allocation."*
- *"Which task consumed the most time?"*

### 🔍 Semantic RAG
- *"What work did I perform on PAM-382?"*
- *"Summarize my Provider Registration work."*
- *"What activities were related to PreAuth?"*
- *"What did I work on during the skeleton loading task?"*

### ⚡ Hybrid (Analytics + RAG)
- *"How many hours did I spend on PreAuth and what work did I perform?"*
- *"Which project consumed most of my time and what type of work was involved?"*
- *"Compare my PreAuth and Provider Registration work."*

---

## 12. Unit & Integration Tests

Run the full backend test suite:

```bash
npm run test:backend
```

Covered suites (22 tests passing):
1. **Excel Normalization**: Header synonyms, date formats, hour formats, missing columns, deduplication.
2. **Analytics Calculations**: Total hours, allocation percentages, chronological monthly allocation, project breakdown, top tasks & tickets.
3. **Date Filtering**: Preset intervals (30 days, 3 months, 6 months) and custom date ranges.
4. **Question Classification**: Accuracy of classifying user questions into Analytics, RAG, or Hybrid.
5. **End-to-End Pipeline**: Full file upload, indexing, retrieval, and source verification.

---

## 13. Troubleshooting

- **ChromaDB Connection Error:** Run `docker compose up -d`. If Docker is unavailable, the application continues running seamlessly using its built-in in-memory vector storage fallback.
- **Port Conflict (3000 or 4200):** Modify `PORT` in `.env` or run Angular on an alternate port with `ng serve --port 4300`.
- **OpenAI Quota Exceeded / Missing Key:** The backend includes an offline synthesis fallback that formats calculated analytics and retrieved vector documents without failing.

---

## 14. What I Learned from This Project (Manager Demo Explanation)

> *"In building this project, the core architectural lesson was that **LLMs are language processors, not calculators or database engines**. 
>
> If you feed a 5,000-row spreadsheet to an LLM and ask for percentage allocation, it will often hallucinate or produce inaccurate math. Conversely, if you rely solely on SQL or spreadsheets, you cannot ask conceptual questions like 'Summarize our work on skeleton loading'.
>
> The breakthrough comes from a **Hybrid AI Architecture**:
> 1. **Intelligent Question Routing:** We classify intent before invoking any model. Numerical questions route to deterministic TypeScript logic; qualitative questions route to Vector Semantic Search (ChromaDB + OpenAI embeddings); and hybrid questions fuse both.
> 2. **Token Efficiency & Factuality:** We never send raw spreadsheet dumps to the LLM. Only pre-computed math and top-K retrieved vector records are supplied in context with strict zero-hallucination prompting.
> 3. **Traceability:** Every AI answer is backed by interactive, verifiable citations (ticket key, task name, logged hours, and date).
>
> This demonstrates how modern enterprise AI applications should be designed: pairing deterministic business logic with probabilistic LLM reasoning for high accuracy, cost efficiency, and user trust."*
