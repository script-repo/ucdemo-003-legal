# Document Summarization — Ralph Method Build

## Overview

Build the "Document Summarization" use case (UC-03) as a functioning page in the Legal AI Portal. The user uploads a document (TXT, PDF, DOCX) or pastes text; the system sends it to Nutanix AI (via the local proxy) and returns a structured summary with key facts, dates, parties, issues, and source citations. The page must match UC-01's architecture pattern (architecture diagram on the left, input on the right, full-width results below) and follow the portal style guide.

## Context

- **Portal location:** `portal/index.html` (served from project root via `python server.py`)
- **This use case:** `portal/use-cases/03-document-summarization/`
- **Working UC-01 reference:** `portal/use-cases/01-contract-review-and-analysis/` — copy the same structural patterns (self-contained JS, no ES modules, proxy-based AI calls, architecture SVG diagram, sidebar input, full-width results).
- **Style guide:** `docs/style-guide.md` — same CSS variables, fonts, colors.
- **AI proxy:** `server.py` at project root proxies `/api/ai/*` → Nutanix AI endpoint. Use `/api/ai/chat/completions` for inference.
- **AI model:** `llama3-1-8b` for chat completions, `llama-3-2-embed` for embeddings.
- **Shared databases:** PostgreSQL (pg-db:5432) for summary history; ChromaDB (ch-db:8000) for semantic search. Both are placeholders — fall back to mock data.
- **PRD:** `portal/use-cases/03-document-summarization/PRD.md`

## Tasks

### Task 1: Create index.html

Create `portal/use-cases/03-document-summarization/index.html` with:
- Same page header pattern: "← Portal" back link, "Legal AI" logo, page title "Document Summarization"
- Two-column landing layout:
  - **Left (main):** Architecture overview SVG diagram + detailed "How It Works" description
  - **Right (sidebar):** File upload zone (TXT/PDF/DOCX) + OR divider + text paste textarea + "Summarize" button + summary length selector (Brief / Standard / Detailed) + recent summaries history
- Loading state section (spinner + "Generating summary...")
- Full-width results section: top bar with "← New Summary" button, then structured summary output
- No `type="module"` — use `<script src="app.js" defer>`
- Include CDN scripts for mammoth.js and pdf.js (same as UC-01)
- Link to `styles.css` and Google Fonts (Montserrat, Roboto, Roboto Slab)

### Task 2: Create the architecture SVG diagram

Inside index.html, create an inline SVG (~780x720 viewBox) showing:
- **Nutanix AHV** (outer dashed border)
- **NKP** (blue region): Portal UI pod, API Proxy pod, PostgreSQL pod (pg-db) with Nutanix Volumes PVC, ChromaDB pod (ch-db) with Nutanix Volumes PVC, Ingress/LoadBalancer, Kubernetes services
- **NAI** (orange region): Chat Completions (llama3-1-8b) for summarization, Embeddings (llama-3-2-embed) for document indexing, endpoint URL
- **Nutanix Unified Storage** (green region): LLM Model Repository, Nutanix Volumes
- RAG pipeline flow label (2 lines to fit box)
- Data flow arrows, arrow markers in `<defs>`

### Task 3: Create styles.css

Create `portal/use-cases/03-document-summarization/styles.css` with:
- Same CSS variables and base styles as UC-01
- Page header, two-column landing layout, diagram wrapper
- Sidebar input cards, upload zone (compact), paste textarea, summary length selector (radio group or button group)
- "Summarize" button (primary blue, disabled state)
- Results section: executive summary card, key facts list (dates, parties, issues as badges/tags), source references, section-by-section breakdown
- "New Summary" button
- Loading spinner, error banner, history list, hidden class

### Task 4: Create app.js

Create `portal/use-cases/03-document-summarization/app.js` as a self-contained IIFE:
- **AI config:** proxy base `/api/ai`, model `llama3-1-8b`
- **System prompt:** Act as a legal document summarization AI. Given document text and a detail level (brief/standard/detailed), return JSON:
  - `title`: document title or best guess
  - `documentType`: type of document (contract, deposition, brief, etc.)
  - `executiveSummary`: 2-5 sentence overview
  - `keyFacts`: array of `{ category (date/party/issue/term/obligation), value, context }`
  - `sections`: array of `{ heading, summary }` for section-by-section breakdown
  - `wordCount`: original word count estimate
  - `summaryWordCount`: summary word count
- **File extraction:** Same pattern as UC-01 (FileReader for TXT, mammoth for DOCX, pdf.js for PDF)
- **Mock data:** Realistic mock summary for when AI is unavailable
- **Summary history:** In-memory mock list
- **DOM wiring:** File upload OR paste → select detail level → "Summarize" → loading → results
- **Results rendering:** Title/type card, executive summary, key facts as tagged items, section breakdown, word count comparison
- **"New Summary" button** returns to landing

### Task 5: Update portal app.js

In `portal/app.js`, find UC-03 entry and change `live` to `true` (add `live: true` to the object).

### Task 6: Write detailed architecture description

Below the SVG, write thorough "How It Works" covering: AHV, NKP, all pods/services/PVCs, NAI endpoints, RAG pipeline for summarization, storage layer, data flow. Mention Nutanix Unified Storage for LLM model repo, Nutanix Volumes for PVCs, NKP on AHV.

## Technical Notes

- All files in `portal/use-cases/03-document-summarization/`
- NO ES modules — IIFE pattern
- AI calls via `/api/ai/chat/completions`
- Same CSS variable values as UC-01
- Back link href: `../../index.html`
- SVG text must fit within boxes — split long text across lines

## Checklist

- [ ] index.html created with header, landing layout, diagram, description, loading, results
- [ ] Architecture SVG complete with all Nutanix components
- [ ] styles.css created with all styles
- [ ] app.js created with AI call, file extraction, mock fallback, results rendering
- [ ] File upload and text paste both work
- [ ] Summary length selector (brief/standard/detailed) works
- [ ] Results show title, executive summary, key facts, section breakdown
- [ ] "New Summary" returns to landing
- [ ] Portal app.js updated: UC-03 live: true
- [ ] History renders and updates
- [ ] All SVG text fits within boxes
- [ ] Page works at `http://localhost:8080/use-cases/03-document-summarization/`

## Stop Condition

Exit when ALL:
- All 3 files exist in `portal/use-cases/03-document-summarization/`
- Page loads without console errors
- Upload or paste + "Summarize" shows AI or mock results
- Results include executive summary, key facts, section breakdown
- "New Summary" returns to landing
- Portal card for UC-03 shows "Launch"
- All checklist items complete
