# E-Discovery and Document Review — Ralph Method Build

## Overview

Build the "E-Discovery and Document Review" use case (UC-08) as a functioning page in the Legal AI Portal. The user uploads documents (TXT, PDF, DOCX) or pastes text for review; the system sends them to Nutanix AI (via the local proxy) and returns structured e-discovery analysis: document classification (responsive/non-responsive/privileged), relevance scoring, key themes, privilege flags, and document summaries for deposition/trial prep. The page must match UC-01's architecture pattern (architecture diagram on the left, input on the right, full-width results below) and follow the portal style guide.

## Context

- **Portal location:** `portal/index.html` (served from project root via `python server.py`)
- **This use case:** `portal/use-cases/08-e-discovery-and-document-review/`
- **Working UC-01 reference:** `portal/use-cases/01-contract-review-and-analysis/` — copy the same structural patterns (self-contained JS, no ES modules, proxy-based AI calls, architecture SVG diagram, sidebar input, full-width results).
- **Style guide:** `docs/style-guide.md` — same CSS variables, fonts, colors.
- **AI proxy:** `server.py` at project root proxies `/api/ai/*` → Nutanix AI endpoint. Use `/api/ai/chat/completions` for inference.
- **AI model:** `llama3-1-8b` for chat completions, `llama-3-2-embed` for embeddings.
- **PRD:** `portal/use-cases/08-e-discovery-and-document-review/PRD.md`

## Tasks

### Task 1: Create index.html

Create `portal/use-cases/08-e-discovery-and-document-review/index.html` with:
- Same page header pattern: "← Portal" back link, "Legal AI" logo, page title "E-Discovery & Document Review"
- Two-column landing layout:
  - **Left (main):** Architecture overview SVG diagram + detailed "How It Works" description
  - **Right (sidebar):** File upload zone (TXT/PDF/DOCX) + OR divider + text paste textarea + matter context textarea (brief description of the case/matter for relevance scoring) + review scope checkboxes (Responsiveness / Privilege / Key Documents / Hot Documents) + "Analyze Documents" button + recent review history
- Loading state section (spinner + "Analyzing documents for review...")
- Full-width results section: top bar with "← New Review" button, then structured review output
- No `type="module"` — use `<script src="app.js" defer>`
- Include CDN scripts for mammoth.js and pdf.js (same as UC-01)
- Link to `styles.css` and Google Fonts (Montserrat, Roboto, Roboto Slab)

### Task 2: Create the architecture SVG diagram

Inside index.html, create an inline SVG (~780x720 viewBox) showing:
- **Nutanix AHV** (outer dashed border)
- **NKP** (blue region): Portal UI pod, API Proxy pod, PostgreSQL pod (pg-db) with Nutanix Volumes PVC, ChromaDB pod (ch-db) with Nutanix Volumes PVC, Ingress/LoadBalancer
- **NAI** (orange region): Chat Completions (llama3-1-8b) for document classification and summarization, Embeddings (llama-3-2-embed) for conceptual search and clustering, endpoint URL
- **Nutanix Unified Storage** (green region): LLM Model Repository, Nutanix Volumes
- RAG pipeline flow label (2 lines to fit box)
- Data flow arrows, arrow markers in `<defs>`

### Task 3: Create styles.css

Create `portal/use-cases/08-e-discovery-and-document-review/styles.css` with:
- Same CSS variables and base styles as UC-01 (html font-size: 100%, body font-size: 16px, form elements 15px)
- Page header, two-column landing layout, diagram wrapper
- Sidebar input cards, upload zone (compact), paste textarea, matter context field, review scope checkboxes
- "Analyze Documents" button (primary blue, disabled state)
- Results section: review dashboard with stats (total docs, responsive, privileged, hot docs), document classification cards showing:
  - Document title/identifier
  - Classification badge (Responsive / Non-Responsive / Privileged / Hot Document)
  - Relevance score (progress bar, 0-100)
  - Key themes tags
  - Privilege flags (Attorney-Client, Work Product, Joint Defense)
  - Document summary
  - Recommended action (Produce / Withhold / Further Review)
- Thematic analysis section (key themes across all documents)
- Review metrics dashboard (pie chart or stats cards)
- "New Review" button
- Loading spinner, error banner, history list, hidden class

### Task 4: Create app.js

Create `portal/use-cases/08-e-discovery-and-document-review/app.js` as a self-contained IIFE:
- **AI config:** proxy base `/api/ai`, model `llama3-1-8b`
- **System prompt:** Act as an e-discovery document review AI. Given document text, matter context, and review scope, return JSON:
  - `documentTitle`: identified or inferred title
  - `documentType`: type (email, memo, contract, report, etc.)
  - `classification`: { status (Responsive/Non-Responsive/Potentially Responsive), confidence (0-100) }
  - `relevanceScore`: 0-100
  - `privilegeAnalysis`: { isPrivileged: boolean, type (Attorney-Client/Work Product/Joint Defense/None), indicators: [], recommendation }
  - `isHotDocument`: boolean
  - `hotDocumentReason`: string (if hot)
  - `themes`: array of { theme, relevance (high/medium/low) }
  - `keyEntities`: array of { name, type (person/org/date/location), context }
  - `summary`: 2-5 sentence summary
  - `keyPassages`: array of { text, relevance, page }
  - `recommendation`: { action (Produce/Withhold/Further Review), reasoning }
  - `reviewNotes`: additional notes for the reviewer
- **File extraction:** Same pattern as UC-01 (FileReader for TXT, mammoth for DOCX, pdf.js for PDF)
- **Mock data:** Realistic mock review results for when AI is unavailable (include 3-4 mock documents)
- **Review history:** In-memory mock list
- **DOM wiring:** File upload OR paste → enter matter context → select review scope → "Analyze Documents" → loading → results
- **Results rendering:** Dashboard stats, document cards with classification badges, relevance bars, privilege flags, themes, summaries, recommendations
- **"New Review" button** returns to landing

### Task 5: Update portal app.js

In `portal/app.js`, find UC-08 entry and change `live` to `true`.

### Task 6: Write detailed architecture description

Below the SVG, write thorough "How It Works" covering: AHV, NKP, all pods/services/PVCs, NAI endpoints, TAR/RAG pipeline for document classification and conceptual search, storage layer, data flow. Mention Nutanix Unified Storage for LLM model repo, Nutanix Volumes for PVCs, NKP on AHV.

## Technical Notes

- All files in `portal/use-cases/08-e-discovery-and-document-review/`
- NO ES modules — IIFE pattern
- AI calls via `/api/ai/chat/completions`
- Same CSS variable values as UC-01
- Back link href: `../../index.html`
- SVG text must fit within boxes — split long text across lines
- Use `e.stopPropagation()` on file inputs inside upload zones to prevent double file dialog

## Checklist

- [ ] index.html created with header, landing layout, diagram, description, loading, results
- [ ] Architecture SVG complete with all Nutanix components
- [ ] styles.css created with all styles (html 100%, body 16px, forms 15px)
- [ ] app.js created with AI call, file extraction, mock fallback, results rendering
- [ ] File upload and text paste both work
- [ ] Matter context and review scope inputs work
- [ ] Results show dashboard stats, document cards, classification, privilege, themes, summaries
- [ ] "New Review" returns to landing
- [ ] Portal app.js updated: UC-08 live: true
- [ ] History renders and updates
- [ ] All SVG text fits within boxes
- [ ] File input uses stopPropagation to prevent double dialog
- [ ] Page works at `http://localhost:8080/use-cases/08-e-discovery-and-document-review/`

## Stop Condition

Exit when ALL:
- All 3 files exist in `portal/use-cases/08-e-discovery-and-document-review/`
- Page loads without console errors
- Upload or paste + "Analyze Documents" shows AI or mock results
- Results include classification, relevance, privilege analysis, themes, summaries
- "New Review" returns to landing
- Portal card for UC-08 shows "Launch"
- All checklist items complete
