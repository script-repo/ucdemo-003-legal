# Automated Contract Redlining and Clause Comparison — Ralph Method Build

## Overview

Build the "Automated Contract Redlining and Clause Comparison" use case (UC-07) as a functioning page in the Legal AI Portal. The user uploads two documents (a counterparty draft and a firm standard/template) or pastes both texts; the system sends them to Nutanix AI (via the local proxy) and returns a structured clause-by-clause comparison with redline markup, deviation analysis, risk flags, and suggested language. The page must match UC-01's architecture pattern (architecture diagram on the left, input on the right, full-width results below) and follow the portal style guide.

## Context

- **Portal location:** `portal/index.html` (served from project root via `python server.py`)
- **This use case:** `portal/use-cases/07-automated-contract-redlining-and-clause-comparison/`
- **Working UC-01 reference:** `portal/use-cases/01-contract-review-and-analysis/` — copy the same structural patterns (self-contained JS, no ES modules, proxy-based AI calls, architecture SVG diagram, sidebar input, full-width results).
- **Style guide:** `docs/style-guide.md` — same CSS variables, fonts, colors.
- **AI proxy:** `server.py` at project root proxies `/api/ai/*` → Nutanix AI endpoint. Use `/api/ai/chat/completions` for inference.
- **AI model:** `llama3-1-8b` for chat completions, `llama-3-2-embed` for embeddings.
- **PRD:** `portal/use-cases/07-automated-contract-redlining-and-clause-comparison/PRD.md`

## Tasks

### Task 1: Create index.html

Create `portal/use-cases/07-automated-contract-redlining-and-clause-comparison/index.html` with:
- Same page header pattern: "← Portal" back link, "Legal AI" logo, page title "Contract Redlining & Clause Comparison"
- Two-column landing layout:
  - **Left (main):** Architecture overview SVG diagram + detailed "How It Works" description
  - **Right (sidebar):** TWO input sections:
    1. "Counterparty Draft" — file upload zone (TXT/PDF/DOCX) + OR divider + text paste textarea
    2. "Firm Standard / Template" — file upload zone (TXT/PDF/DOCX) + OR divider + text paste textarea
    + Contract type selector (NDA, MSA, SaaS Agreement, Employment, Lease, Other)
    + "Compare & Redline" button
    + recent comparison history
- Loading state section (spinner + "Generating redline comparison...")
- Full-width results section: top bar with "← New Comparison" button, then structured redline output
- No `type="module"` — use `<script src="app.js" defer>`
- Include CDN scripts for mammoth.js and pdf.js (same as UC-01)
- Link to `styles.css` and Google Fonts (Montserrat, Roboto, Roboto Slab)

### Task 2: Create the architecture SVG diagram

Inside index.html, create an inline SVG (~780x720 viewBox) showing:
- **Nutanix AHV** (outer dashed border)
- **NKP** (blue region): Portal UI pod, API Proxy pod, PostgreSQL pod (pg-db) with Nutanix Volumes PVC, ChromaDB pod (ch-db) with Nutanix Volumes PVC, Ingress/LoadBalancer
- **NAI** (orange region): Chat Completions (llama3-1-8b) for clause comparison, Embeddings (llama-3-2-embed) for clause alignment, endpoint URL
- **Nutanix Unified Storage** (green region): LLM Model Repository, Nutanix Volumes
- RAG pipeline flow label (2 lines to fit box)
- Data flow arrows, arrow markers in `<defs>`

### Task 3: Create styles.css

Create `portal/use-cases/07-automated-contract-redlining-and-clause-comparison/styles.css` with:
- Same CSS variables and base styles as UC-01 (html font-size: 100%, body font-size: 16px, form elements 15px)
- Page header, two-column landing layout, diagram wrapper
- Sidebar: two input cards side-by-side or stacked (counterparty draft + firm standard), contract type selector, compact upload zones
- "Compare & Redline" button (primary blue, disabled state)
- Results section: summary stats (clauses compared, deviations found, risk level), clause-by-clause comparison table/cards showing:
  - Clause heading
  - Firm standard text (green background)
  - Counterparty text (red/strikethrough for removals, green for additions)
  - Deviation severity badge (Minor/Moderate/Major/Critical)
  - AI suggested language
  - Accept/Reject/Modify buttons
- Overall risk assessment card
- "New Comparison" button
- Loading spinner, error banner, history list, hidden class

### Task 4: Create app.js

Create `portal/use-cases/07-automated-contract-redlining-and-clause-comparison/app.js` as a self-contained IIFE:
- **AI config:** proxy base `/api/ai`, model `llama3-1-8b`
- **System prompt:** Act as a legal contract redlining AI. Given two contract texts (counterparty draft and firm standard) and contract type, return JSON:
  - `contractType`: identified type
  - `overallRisk`: { level (Low/Medium/High/Critical), score (1-10) }
  - `summary`: { clausesCompared, deviationsFound, criticalIssues, acceptableAsIs }
  - `clauses`: array of { heading, standardText, counterpartyText, deviationType (Added/Removed/Modified/Unchanged), severity (Minor/Moderate/Major/Critical), analysis, suggestedLanguage, recommendation (Accept/Reject/Negotiate) }
  - `missingClauses`: array of clauses in standard but missing from draft
  - `addedClauses`: array of clauses in draft but not in standard
  - `recommendations`: array of overall recommendations
- **File extraction:** Same pattern as UC-01 (FileReader for TXT, mammoth for DOCX, pdf.js for PDF) — need TWO file inputs
- **Mock data:** Realistic mock redline comparison for when AI is unavailable
- **Comparison history:** In-memory mock list
- **DOM wiring:** Upload/paste both docs → select contract type → "Compare & Redline" → loading → results
- **Results rendering:** Summary stats, clause comparison cards with redline styling, deviation badges, suggested language, missing/added clauses, overall risk
- **"New Comparison" button** returns to landing

### Task 5: Update portal app.js

In `portal/app.js`, find UC-07 entry and change `live` to `true`.

### Task 6: Write detailed architecture description

Below the SVG, write thorough "How It Works" covering: AHV, NKP, all pods/services/PVCs, NAI endpoints, RAG pipeline for clause alignment and comparison, storage layer, data flow. Mention Nutanix Unified Storage for LLM model repo, Nutanix Volumes for PVCs, NKP on AHV.

## Technical Notes

- All files in `portal/use-cases/07-automated-contract-redlining-and-clause-comparison/`
- NO ES modules — IIFE pattern
- AI calls via `/api/ai/chat/completions`
- Same CSS variable values as UC-01
- Back link href: `../../index.html`
- SVG text must fit within boxes — split long text across lines
- IMPORTANT: Two separate file inputs are needed (counterparty + standard)
- Use `e.stopPropagation()` on file inputs inside upload zones to prevent double file dialog

## Checklist

- [ ] index.html created with header, landing layout, diagram, description, loading, results
- [ ] Architecture SVG complete with all Nutanix components
- [ ] styles.css created with all styles (html 100%, body 16px, forms 15px)
- [ ] app.js created with AI call, dual file extraction, mock fallback, results rendering
- [ ] Both file uploads and text pastes work (counterparty + standard)
- [ ] Contract type selector works
- [ ] Results show summary stats, clause comparison with redline, deviation badges, suggestions
- [ ] "New Comparison" returns to landing
- [ ] Portal app.js updated: UC-07 live: true
- [ ] History renders and updates
- [ ] All SVG text fits within boxes
- [ ] File inputs use stopPropagation to prevent double dialog
- [ ] Page works at `http://localhost:8080/use-cases/07-automated-contract-redlining-and-clause-comparison/`

## Stop Condition

Exit when ALL:
- All 3 files exist in `portal/use-cases/07-automated-contract-redlining-and-clause-comparison/`
- Page loads without console errors
- Upload/paste both docs + "Compare & Redline" shows AI or mock results
- Results include clause comparison, deviation badges, suggested language
- "New Comparison" returns to landing
- Portal card for UC-07 shows "Launch"
- All checklist items complete
