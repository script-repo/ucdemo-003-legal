# Legal Intake and Triage — Ralph Method Build

## Overview

Build the "Legal Intake and Triage" use case (UC-05) as a functioning page in the Legal AI Portal. The user submits an intake request (via form or text paste); the system sends it to Nutanix AI (via the local proxy) and returns structured triage: matter type, jurisdiction, urgency, risk level, suggested routing, and estimated response time. The page must match UC-01's architecture pattern (architecture diagram on the left, input on the right, full-width results below) and follow the portal style guide.

## Context

- **Portal location:** `portal/index.html` (served from project root via `python server.py`)
- **This use case:** `portal/use-cases/05-legal-intake-and-triage/`
- **Working UC-01 reference:** `portal/use-cases/01-contract-review-and-analysis/` — copy the same structural patterns (self-contained JS, no ES modules, proxy-based AI calls, architecture SVG diagram, sidebar input, full-width results).
- **Style guide:** `docs/style-guide.md` — same CSS variables, fonts, colors.
- **AI proxy:** `server.py` at project root proxies `/api/ai/*` → Nutanix AI endpoint. Use `/api/ai/chat/completions` for inference.
- **AI model:** `llama3-1-8b` for chat completions, `llama-3-2-embed` for embeddings.
- **PRD:** `portal/use-cases/05-legal-intake-and-triage/PRD.md`

## Tasks

### Task 1: Create index.html

Create `portal/use-cases/05-legal-intake-and-triage/index.html` with:
- Same page header pattern: "← Portal" back link, "Legal AI" logo, page title "Legal Intake & Triage"
- Two-column landing layout:
  - **Left (main):** Architecture overview SVG diagram + detailed "How It Works" description
  - **Right (sidebar):** Intake form with fields: requestor name, email, department, matter description (large textarea), urgency selector (Low/Medium/High/Critical), preferred practice area dropdown (Litigation, Corporate, IP, Employment, Real Estate, Regulatory, Other) + "Submit Request" button + recent intake history
- Loading state section (spinner + "Processing intake request...")
- Full-width results section: top bar with "← New Request" button, then structured triage output
- No `type="module"` — use `<script src="app.js" defer>`
- Link to `styles.css` and Google Fonts (Montserrat, Roboto, Roboto Slab)

### Task 2: Create the architecture SVG diagram

Inside index.html, create an inline SVG (~780x720 viewBox) showing:
- **Nutanix AHV** (outer dashed border)
- **NKP** (blue region): Portal UI pod, API Proxy pod, PostgreSQL pod (pg-db) with Nutanix Volumes PVC, ChromaDB pod (ch-db) with Nutanix Volumes PVC, Ingress/LoadBalancer
- **NAI** (orange region): Chat Completions (llama3-1-8b) for triage classification, Embeddings (llama-3-2-embed) for similar matter matching, endpoint URL
- **Nutanix Unified Storage** (green region): LLM Model Repository, Nutanix Volumes
- RAG pipeline flow label (2 lines to fit box)
- Data flow arrows, arrow markers in `<defs>`

### Task 3: Create styles.css

Create `portal/use-cases/05-legal-intake-and-triage/styles.css` with:
- Same CSS variables and base styles as UC-01 (html font-size: 100%, body font-size: 16px, form elements 15px)
- Page header, two-column landing layout, diagram wrapper
- Sidebar form cards: labeled inputs, textarea, select dropdowns, urgency selector (button group or radio pills)
- "Submit Request" button (primary blue, disabled state)
- Results section: triage summary card with matter type badge, urgency/risk indicators (color-coded), routing recommendation, estimated timeline, similar matters list
- "New Request" button
- Loading spinner, error banner, history list, hidden class

### Task 4: Create app.js

Create `portal/use-cases/05-legal-intake-and-triage/app.js` as a self-contained IIFE:
- **AI config:** proxy base `/api/ai`, model `llama3-1-8b`
- **System prompt:** Act as a legal intake triage AI. Given request details (description, urgency, practice area), return JSON:
  - `matterType`: classified type (e.g., "Contract Dispute", "Employment Claim", "IP Filing")
  - `jurisdiction`: detected or suggested jurisdiction
  - `urgencyAssessment`: { level (Low/Medium/High/Critical), reasoning }
  - `riskLevel`: { score (1-10), factors: [] }
  - `routing`: { team, assignee suggestion, reasoning }
  - `estimatedResponse`: estimated timeline
  - `similarMatters`: array of { title, similarity, outcome }
  - `nextSteps`: array of recommended next actions
  - `conflictFlags`: any potential conflict indicators
- **Mock data:** Realistic mock triage result for when AI is unavailable
- **Intake history:** In-memory mock list
- **DOM wiring:** Form fill → "Submit Request" → loading → results
- **Results rendering:** Matter type badge, urgency/risk indicators, routing card, timeline, similar matters, next steps
- **"New Request" button** returns to landing

### Task 5: Update portal app.js

In `portal/app.js`, find UC-05 entry and change `live` to `true`.

### Task 6: Write detailed architecture description

Below the SVG, write thorough "How It Works" covering: AHV, NKP, all pods/services/PVCs, NAI endpoints, RAG pipeline for intake matching, storage layer, data flow. Mention Nutanix Unified Storage for LLM model repo, Nutanix Volumes for PVCs, NKP on AHV.

## Technical Notes

- All files in `portal/use-cases/05-legal-intake-and-triage/`
- NO ES modules — IIFE pattern
- AI calls via `/api/ai/chat/completions`
- Same CSS variable values as UC-01
- Back link href: `../../index.html`
- SVG text must fit within boxes — split long text across lines

## Checklist

- [ ] index.html created with header, landing layout, diagram, description, loading, results
- [ ] Architecture SVG complete with all Nutanix components
- [ ] styles.css created with all styles (html 100%, body 16px, forms 15px)
- [ ] app.js created with AI call, form handling, mock fallback, results rendering
- [ ] Intake form submits and triggers triage
- [ ] Results show matter type, urgency, risk, routing, timeline, similar matters, next steps
- [ ] "New Request" returns to landing
- [ ] Portal app.js updated: UC-05 live: true
- [ ] History renders and updates
- [ ] All SVG text fits within boxes
- [ ] Page works at `http://localhost:8080/use-cases/05-legal-intake-and-triage/`

## Stop Condition

Exit when ALL:
- All 3 files exist in `portal/use-cases/05-legal-intake-and-triage/`
- Page loads without console errors
- Intake form submit shows AI or mock results
- Results include matter type, urgency, risk, routing, similar matters
- "New Request" returns to landing
- Portal card for UC-05 shows "Launch"
- All checklist items complete
