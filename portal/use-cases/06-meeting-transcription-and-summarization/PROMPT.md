# Meeting Transcription and Summarization — Ralph Method Build

## Overview

Build the "Meeting Transcription and Summarization" use case (UC-06) as a functioning page in the Legal AI Portal. The user uploads a meeting transcript or recording text (TXT, PDF, DOCX) or pastes transcript text; the system sends it to Nutanix AI (via the local proxy) and returns a structured meeting summary with key points, action items, decisions made, participants, and follow-up deadlines. The page must match UC-01's architecture pattern (architecture diagram on the left, input on the right, full-width results below) and follow the portal style guide.

## Context

- **Portal location:** `portal/index.html` (served from project root via `python server.py`)
- **This use case:** `portal/use-cases/06-meeting-transcription-and-summarization/`
- **Working UC-01 reference:** `portal/use-cases/01-contract-review-and-analysis/` — copy the same structural patterns (self-contained JS, no ES modules, proxy-based AI calls, architecture SVG diagram, sidebar input, full-width results).
- **Style guide:** `docs/style-guide.md` — same CSS variables, fonts, colors.
- **AI proxy:** `server.py` at project root proxies `/api/ai/*` → Nutanix AI endpoint. Use `/api/ai/chat/completions` for inference.
- **AI model:** `llama3-1-8b` for chat completions, `llama-3-2-embed` for embeddings.
- **PRD:** `portal/use-cases/06-meeting-transcription-and-summarization/PRD.md`

## Tasks

### Task 1: Create index.html

Create `portal/use-cases/06-meeting-transcription-and-summarization/index.html` with:
- Same page header pattern: "← Portal" back link, "Legal AI" logo, page title "Meeting Transcription & Summarization"
- Two-column landing layout:
  - **Left (main):** Architecture overview SVG diagram + detailed "How It Works" description
  - **Right (sidebar):** File upload zone (TXT/PDF/DOCX) + OR divider + text paste textarea (for pasting transcript text) + meeting type selector (Client Call / Internal Strategy / Deposition / Board Meeting / Other) + "Summarize Meeting" button + recent meeting history
- Loading state section (spinner + "Analyzing meeting transcript...")
- Full-width results section: top bar with "← New Meeting" button, then structured summary output
- No `type="module"` — use `<script src="app.js" defer>`
- Include CDN scripts for mammoth.js and pdf.js (same as UC-01)
- Link to `styles.css` and Google Fonts (Montserrat, Roboto, Roboto Slab)

### Task 2: Create the architecture SVG diagram

Inside index.html, create an inline SVG (~780x720 viewBox) showing:
- **Nutanix AHV** (outer dashed border)
- **NKP** (blue region): Portal UI pod, API Proxy pod, PostgreSQL pod (pg-db) with Nutanix Volumes PVC, ChromaDB pod (ch-db) with Nutanix Volumes PVC, Ingress/LoadBalancer
- **NAI** (orange region): Chat Completions (llama3-1-8b) for meeting summarization, Embeddings (llama-3-2-embed) for transcript indexing, endpoint URL
- **Nutanix Unified Storage** (green region): LLM Model Repository, Nutanix Volumes
- RAG pipeline flow label (2 lines to fit box)
- Data flow arrows, arrow markers in `<defs>`

### Task 3: Create styles.css

Create `portal/use-cases/06-meeting-transcription-and-summarization/styles.css` with:
- Same CSS variables and base styles as UC-01 (html font-size: 100%, body font-size: 16px, form elements 15px)
- Page header, two-column landing layout, diagram wrapper
- Sidebar input cards, upload zone (compact), paste textarea, meeting type selector (radio pills or dropdown)
- "Summarize Meeting" button (primary blue, disabled state)
- Results section: meeting overview card (date, duration, participants, type), executive summary, action items (checkbox-style list with assignee and deadline), decisions made, key discussion points, follow-up timeline
- "New Meeting" button
- Loading spinner, error banner, history list, hidden class

### Task 4: Create app.js

Create `portal/use-cases/06-meeting-transcription-and-summarization/app.js` as a self-contained IIFE:
- **AI config:** proxy base `/api/ai`, model `llama3-1-8b`
- **System prompt:** Act as a legal meeting summarization AI. Given transcript text and meeting type, return JSON:
  - `meetingTitle`: inferred title
  - `meetingType`: type of meeting
  - `date`: extracted or estimated date
  - `duration`: estimated duration
  - `participants`: array of { name, role }
  - `executiveSummary`: 2-5 sentence overview
  - `keyPoints`: array of { topic, summary, importance (high/medium/low) }
  - `actionItems`: array of { action, assignee, deadline, priority }
  - `decisions`: array of { decision, context, madeBy }
  - `followUps`: array of { item, dueDate, responsible }
  - `matterReferences`: any matter or case references mentioned
- **File extraction:** Same pattern as UC-01 (FileReader for TXT, mammoth for DOCX, pdf.js for PDF)
- **Mock data:** Realistic mock meeting summary for when AI is unavailable
- **Meeting history:** In-memory mock list
- **DOM wiring:** File upload OR paste → select meeting type → "Summarize Meeting" → loading → results
- **Results rendering:** Meeting overview card, executive summary, action items with checkboxes, decisions, key points with importance badges, follow-ups timeline
- **"New Meeting" button** returns to landing

### Task 5: Update portal app.js

In `portal/app.js`, find UC-06 entry and change `live` to `true`.

### Task 6: Write detailed architecture description

Below the SVG, write thorough "How It Works" covering: AHV, NKP, all pods/services/PVCs, NAI endpoints, RAG pipeline for transcript analysis, storage layer, data flow. Mention Nutanix Unified Storage for LLM model repo, Nutanix Volumes for PVCs, NKP on AHV.

## Technical Notes

- All files in `portal/use-cases/06-meeting-transcription-and-summarization/`
- NO ES modules — IIFE pattern
- AI calls via `/api/ai/chat/completions`
- Same CSS variable values as UC-01
- Back link href: `../../index.html`
- SVG text must fit within boxes — split long text across lines

## Checklist

- [ ] index.html created with header, landing layout, diagram, description, loading, results
- [ ] Architecture SVG complete with all Nutanix components
- [ ] styles.css created with all styles (html 100%, body 16px, forms 15px)
- [ ] app.js created with AI call, file extraction, mock fallback, results rendering
- [ ] File upload and text paste both work
- [ ] Meeting type selector works
- [ ] Results show overview, summary, action items, decisions, key points, follow-ups
- [ ] "New Meeting" returns to landing
- [ ] Portal app.js updated: UC-06 live: true
- [ ] History renders and updates
- [ ] All SVG text fits within boxes
- [ ] Page works at `http://localhost:8080/use-cases/06-meeting-transcription-and-summarization/`

## Stop Condition

Exit when ALL:
- All 3 files exist in `portal/use-cases/06-meeting-transcription-and-summarization/`
- Page loads without console errors
- Upload or paste + "Summarize Meeting" shows AI or mock results
- Results include overview, summary, action items, decisions, key points
- "New Meeting" returns to landing
- Portal card for UC-06 shows "Launch"
- All checklist items complete
