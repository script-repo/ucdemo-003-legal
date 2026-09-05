# Legal Research — Ralph Method Build

## Overview

Build the "Legal Research" use case (UC-02) as a functioning page in the Legal AI Portal. The attorney enters a natural-language legal research question; the system sends it to Nutanix AI (via the local proxy) and returns ranked, cited legal authorities with summaries. The page must match UC-01's architecture pattern (architecture diagram on the left, input on the right, full-width results below) and follow the portal style guide.

## Context

- **Portal location:** `portal/index.html` (served from project root via `python server.py`)
- **This use case:** `portal/use-cases/02-legal-research/`
- **Working UC-01 reference:** `portal/use-cases/01-contract-review-and-analysis/` — copy the same structural patterns (self-contained JS, no ES modules, proxy-based AI calls, architecture SVG diagram, sidebar input, full-width results).
- **Style guide:** `docs/style-guide.md` — same CSS variables, fonts, colors.
- **AI proxy:** `server.py` at project root proxies `/api/ai/*` → Nutanix AI endpoint. Use `/api/ai/chat/completions` for inference.
- **AI model:** `llama3-1-8b` for chat completions, `llama-3-2-embed` for embeddings.
- **Shared databases:** PostgreSQL (pg-db:5432) for research history; ChromaDB (ch-db:8000) for semantic search. Both are placeholders — fall back to mock data.
- **PRD:** `portal/use-cases/02-legal-research/PRD.md`

## Tasks

### Task 1: Create index.html

Create `portal/use-cases/02-legal-research/index.html` with:
- Same page header as UC-01: "← Portal" back link, "Legal AI" logo, page title "Legal Research"
- Two-column landing layout:
  - **Left (main):** Architecture overview SVG diagram + detailed "How It Works" description
  - **Right (sidebar):** Research query input (textarea for natural-language question) + "Research" button + recent research history list
- Loading state section (spinner)
- Full-width results section (shown after query): top bar with "← New Research" button, then result cards
- No `type="module"` — use `<script src="app.js" defer>`
- Link to `styles.css` and Google Fonts (Montserrat, Roboto, Roboto Slab)

### Task 2: Create the architecture SVG diagram

Inside index.html, create an inline SVG architecture diagram showing:
- **Nutanix AHV** (outer dashed border) — underlying hypervisor
- **NKP (Nutanix Kubernetes Platform)** (blue region):
  - Portal UI pod (serves Legal Research page)
  - API Proxy pod (CORS proxy → NAI)
  - PostgreSQL pod (pg-db) with Nutanix Volumes PVC — stores research queries and history
  - ChromaDB pod (ch-db) with Nutanix Volumes PVC — stores legal document embeddings for RAG
  - Ingress / LoadBalancer service
  - Kubernetes services with ports
- **NAI (Nutanix AI)** (orange region):
  - Chat Completions endpoint (llama3-1-8b) — query understanding and answer generation
  - Embeddings endpoint (llama-3-2-embed) — legal document vectorization
  - Endpoint URL bar
- **Nutanix Unified Storage** (green region):
  - LLM Model Repository
  - Nutanix Volumes (block storage for PVCs)
- RAG pipeline flow label (split to fit within box)
- Data flow arrows connecting components
- Arrow markers in `<defs>`

### Task 3: Create styles.css

Create `portal/use-cases/02-legal-research/styles.css` with:
- Same CSS variables as UC-01 (colors, fonts, shadows, radius, transitions)
- Same base styles (box-sizing, html 62.5%, body, skip-link, header, logo)
- Page header styles (fixed, dark background)
- Two-column landing layout (grid: 1fr 340px, responsive collapse)
- Diagram wrapper (card with shadow, overflow-x auto)
- Architecture description styles (h3, p, ul, ol, code)
- Sidebar input card styles
- Textarea styling for research query
- "Research" button (primary blue, disabled state)
- Results section: result cards with title, jurisdiction badge, citation, summary, relevance score
- "Not helpful" / "Helpful" feedback buttons on each result
- Loading spinner
- Error banner
- History list items
- All hidden utility class
- Responsive breakpoints

### Task 4: Create app.js

Create `portal/use-cases/02-legal-research/app.js` as a self-contained IIFE (no ES modules):
- **AI config:** proxy base `/api/ai`, model `llama3-1-8b`
- **System prompt:** Instruct the LLM to act as a legal research assistant. Given a research question, return JSON with:
  - `summary`: 2-3 sentence overview answering the question
  - `authorities`: array of objects with `{ title, type (case/statute/secondary), jurisdiction, citation, year, summary, relevanceScore (0-100), keyPassage }`
  - `contraryAuthority`: array (same shape) of potentially adverse authorities
  - `suggestedFollowUp`: array of follow-up research questions
- **Mock data:** Provide realistic mock results for when AI is unavailable
- **Research history:** In-memory mock list with 3-4 sample past queries
- **DOM wiring:** Query textarea → "Research" button (enabled when ≥10 chars) → loading → results
- **Results rendering:** Render each authority as a card with: title (h3), jurisdiction badge, citation, year, summary text, relevance bar, key passage (collapsible), feedback buttons
- **Contrary authority section** below main results
- **Suggested follow-up questions** as clickable chips that re-run the search
- **"New Research" button** returns to landing view
- **Render history** on page load

### Task 5: Update portal index.html link

The portal card for UC-02 in `portal/app.js` already has `slug: '02-legal-research'` and `live: false`. Change `live` to `true` so the card links to the use case page and shows "Launch" instead of "View PRD" / "Coming Soon".

### Task 6: Write detailed architecture description

In index.html, below the SVG diagram, write a thorough "How It Works" section covering:
- Platform infrastructure (AHV + NKP)
- Kubernetes workloads (all pods, services, PVCs)
- AI & Inference (NAI chat completions for research answer generation, embeddings for legal doc vectorization)
- RAG pipeline for legal research (embed query → search legal corpus in ChromaDB → assemble context → generate cited answer)
- Storage layer (Unified Storage for models, Volumes for PVCs)
- Data flow (user query → proxy → NAI → structured results → UI)
- Mention: Nutanix Unified Storage provides the LLM model repo for NAI; Nutanix Volumes provide PVCs; NAI provides embedding model; NKP runs on AHV

## Technical Notes

- All files are in `portal/use-cases/02-legal-research/`
- NO ES module imports — everything in app.js is inlined in an IIFE
- The AI proxy is already running at `/api/ai/*` via `server.py`
- Use the same CSS variable values as UC-01 (copy the `:root` block)
- Back link href: `../../index.html`
- The architecture SVG viewBox should be ~780x720 to match UC-01 proportions
- Keep text inside SVG boxes — split long text across lines
- Use `font-family="Roboto, sans-serif"` for headings and `font-family="Montserrat, sans-serif"` for body text in SVG

## Checklist

- [ ] `portal/use-cases/02-legal-research/index.html` created with header, landing layout, diagram, description, loading, results
- [ ] Architecture SVG diagram is complete with all Nutanix components and data flow arrows
- [ ] `portal/use-cases/02-legal-research/styles.css` created with all necessary styles
- [ ] `portal/use-cases/02-legal-research/app.js` created with AI call, mock fallback, results rendering
- [ ] Textarea input works — typing enables "Research" button, clicking triggers analysis
- [ ] Results show authority cards with citations, summaries, relevance, feedback buttons
- [ ] Contrary authority and follow-up suggestions are rendered
- [ ] "New Research" button returns to landing
- [ ] Portal `app.js` updated: UC-02 `live: true`
- [ ] History renders on load and updates after each query
- [ ] All text in SVG fits within its containing boxes
- [ ] Page works at `http://localhost:8080/use-cases/02-legal-research/`

## Stop Condition

Exit when ALL of the following are true:
- All 3 files exist (index.html, styles.css, app.js) in `portal/use-cases/02-legal-research/`
- The page loads without console errors at `http://localhost:8080/use-cases/02-legal-research/`
- Entering a legal research question and clicking "Research" shows either AI-generated or mock results
- Results include authority cards, contrary authority, and follow-up suggestions
- "New Research" returns to the landing view
- Portal card for UC-02 shows "Launch" and links to the page
- All checklist items above are complete
