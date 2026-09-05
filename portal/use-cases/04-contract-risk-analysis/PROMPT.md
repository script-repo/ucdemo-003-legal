# Contract Risk Analysis — Ralph Method Build

## Overview

Build the "Contract Risk Analysis" use case (UC-04) as a functioning page in the Legal AI Portal. The user uploads a contract (TXT, PDF, DOCX) or pastes text; the system sends it to Nutanix AI (via the local proxy) and returns a risk dashboard with an overall risk score, risk heat map by category, clause-level risk details, recommended fallbacks, and regulatory commitment extraction. The page must match UC-01's architecture pattern (diagram left, input right, full-width results) and follow the portal style guide.

## Context

- **Portal location:** `portal/index.html` (served from project root via `python server.py`)
- **This use case:** `portal/use-cases/04-contract-risk-analysis/`
- **Working UC-01 reference:** `portal/use-cases/01-contract-review-and-analysis/` — copy same structural patterns (self-contained JS, no ES modules, proxy-based AI calls, architecture SVG diagram, sidebar input, full-width results).
- **Style guide:** `docs/style-guide.md` — same CSS variables, fonts, colors.
- **AI proxy:** `server.py` at project root proxies `/api/ai/*` → Nutanix AI endpoint.
- **AI model:** `llama3-1-8b` for chat completions, `llama-3-2-embed` for embeddings.
- **Shared databases:** PostgreSQL (pg-db:5432) for contract history; ChromaDB (ch-db:8000) for clause embeddings. Both are placeholders — fall back to mock data.
- **PRD:** `portal/use-cases/04-contract-risk-analysis/PRD.md`
- **Difference from UC-01:** UC-01 does clause-level review and deviation detection. UC-04 focuses on the risk dashboard: overall risk score, risk categories (financial, operational, compliance, legal, reputational), heat map visualization, regulatory commitments extraction, and recommended actions. Think of it as the "risk officer's view" versus UC-01's "reviewer's view."

## Tasks

### Task 1: Create index.html

Create `portal/use-cases/04-contract-risk-analysis/index.html` with:
- Same page header: "← Portal" back link, "Legal AI" logo, page title "Contract Risk Analysis"
- Two-column landing layout:
  - **Left (main):** Architecture overview SVG diagram + detailed "How It Works" description
  - **Right (sidebar):** File upload zone (TXT/PDF/DOCX) + OR divider + text paste textarea + risk taxonomy selector (checkboxes: Financial, Operational, Compliance, Legal, Reputational — all checked by default) + "Analyze Risk" button + recent analysis history
- Loading state section
- Full-width results section: top bar with "← New Analysis", then risk dashboard
- No `type="module"` — use `<script src="app.js" defer>`
- Include CDN scripts for mammoth.js and pdf.js
- Link to styles.css and Google Fonts

### Task 2: Create the architecture SVG diagram

Inside index.html, create inline SVG (~780x720 viewBox) showing:
- **Nutanix AHV** (outer dashed border)
- **NKP** (blue region): Portal UI pod, API Proxy pod, PostgreSQL pod (pg-db) with Nutanix Volumes PVC, ChromaDB pod (ch-db) with Nutanix Volumes PVC, Ingress/LoadBalancer, Kubernetes services
- **NAI** (orange region): Chat Completions (llama3-1-8b) for risk analysis, Embeddings (llama-3-2-embed) for clause vectorization, endpoint URL
- **Nutanix Unified Storage** (green region): LLM Model Repository, Nutanix Volumes
- Risk analysis pipeline flow label (2 lines)
- Data flow arrows, arrow markers in `<defs>`

### Task 3: Create styles.css

Create `portal/use-cases/04-contract-risk-analysis/styles.css` with:
- Same CSS variables and base styles as UC-01
- Page header, two-column landing layout, diagram wrapper
- Sidebar: input cards, upload zone, paste textarea, taxonomy checkboxes (styled), "Analyze Risk" button
- Results dashboard:
  - Overall risk score (large number + badge, colored border like UC-01)
  - Risk heat map: a grid/table showing categories (Financial, Operational, Compliance, Legal, Reputational) with color-coded severity cells (green/yellow/red)
  - Clause risk cards: each with clause name, risk category badge, severity badge, description, recommended action
  - Regulatory commitments section: list of extracted obligations with deadlines
  - Recommended actions summary
- "New Analysis" button
- Loading spinner, error banner, history list, hidden class

### Task 4: Create app.js

Create `portal/use-cases/04-contract-risk-analysis/app.js` as self-contained IIFE:
- **AI config:** proxy base `/api/ai`, model `llama3-1-8b`
- **System prompt:** Act as a contract risk analysis AI. Given contract text and selected risk categories, return JSON:
  - `overallRiskScore`: 1-100
  - `overallRiskLevel`: Low/Medium/High
  - `summary`: 2-3 sentence risk overview
  - `categoryScores`: object with `{ financial, operational, compliance, legal, reputational }` each having `{ score (1-100), level, topIssue }`
  - `clauseRisks`: array of `{ clauseName, category, severity (Low/Medium/High), description, recommendedAction, fallbackLanguage }`
  - `regulatoryCommitments`: array of `{ obligation, jurisdiction, deadline, riskIfMissed }`
  - `recommendedActions`: array of `{ priority (High/Medium/Low), action, rationale }`
- **File extraction:** Same pattern as UC-01
- **Mock data:** Realistic mock with varied risk scores per category
- **Analysis history:** In-memory mock list
- **DOM wiring:** File upload OR paste → select categories → "Analyze Risk" → loading → dashboard
- **Results rendering:**
  - Large risk score display (colored)
  - Heat map grid (5 categories × severity, color-coded cells)
  - Clause risk cards with category and severity badges
  - Regulatory commitments as a table
  - Recommended actions as prioritized list
- **"New Analysis" button** returns to landing

### Task 5: Update portal app.js

In `portal/app.js`, find UC-04 entry and change to `live: true`.

### Task 6: Write detailed architecture description

Below SVG, write thorough "How It Works" covering: AHV, NKP, pods/services/PVCs, NAI endpoints (completions for risk scoring, embeddings for clause matching against risk taxonomy), risk analysis pipeline, storage layer, data flow. Mention Nutanix Unified Storage for model repo, Volumes for PVCs, NKP on AHV.

## Technical Notes

- All files in `portal/use-cases/04-contract-risk-analysis/`
- NO ES modules — IIFE pattern
- AI calls via `/api/ai/chat/completions`
- Same CSS variable values as UC-01
- Back link href: `../../index.html`
- SVG text must fit within boxes

## Checklist

- [ ] index.html created with header, landing layout, diagram, description, loading, results
- [ ] Architecture SVG complete with all Nutanix components
- [ ] styles.css created with all styles
- [ ] app.js created with AI call, file extraction, mock fallback, dashboard rendering
- [ ] File upload and text paste both work
- [ ] Risk taxonomy checkboxes work
- [ ] Results show risk score, heat map, clause risks, regulatory commitments, actions
- [ ] "New Analysis" returns to landing
- [ ] Portal app.js updated: UC-04 live: true
- [ ] History renders and updates
- [ ] All SVG text fits within boxes
- [ ] Page works at `http://localhost:8080/use-cases/04-contract-risk-analysis/`

## Stop Condition

Exit when ALL:
- All 3 files exist in `portal/use-cases/04-contract-risk-analysis/`
- Page loads without console errors
- Upload or paste + "Analyze Risk" shows AI or mock results
- Dashboard shows risk score, heat map, clause risks, commitments, actions
- "New Analysis" returns to landing
- Portal card for UC-04 shows "Launch"
- All checklist items complete
