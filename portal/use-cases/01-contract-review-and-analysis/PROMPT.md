# Contract Review and Analysis — Ralph Method PRD

## Overview
Build the "Contract Review and Analysis" use case (UC-01) as a web app page accessible from the Legal AI Portal. Uses the same Style Guide (raslg.com-derived). External backend components (RAG pipeline, PostgreSQL, inferencing) are stubbed with placeholders.

## Context

### Portal Location
- Portal files: `portal/index.html`, `portal/styles.css`, `portal/app.js`
- This use case: `use-cases/01-contract-review-and-analysis/`
- Style Guide: `docs/style-guide.md` (raslg.com-derived CSS variables, fonts, components)
- PRD: `use-cases/01-contract-review-and-analysis/PRD.md`

### External Components (Placeholder)
These do NOT exist yet. Create placeholder JavaScript modules that simulate their APIs:
1. **RAG Pipeline + Vector DB** — `api/rag-pipeline.js` — simulates semantic search over contract clauses
2. **PostgreSQL Database** — `api/database.js` — simulates contract metadata storage and retrieval
3. **Inferencing Endpoints** — `api/inference.js` — simulates LLM analysis (clause classification, risk scoring, summarization)

### Style
- MUST use the same CSS variables, fonts, and component patterns as `portal/styles.css`
- Link to a shared stylesheet (copy or import the portal CSS variables)
- Same header/logo pattern; add "← Back to Portal" link
- Same card, button, and typography patterns

## Tasks

### Task 1: Create placeholder API modules
Create `use-cases/01-contract-review-and-analysis/api/` with:
- `rag-pipeline.js` — exports `searchClauses(query)` → returns mock clause matches with relevance scores
- `database.js` — exports `saveContract(meta)`, `getContracts()`, `getContractById(id)` → returns mock data
- `inference.js` — exports `analyzeContract(text)` → returns mock { riskScore, clauses[], summary, deviations[] }
Each must return realistic mock data with 2-second simulated delay (setTimeout/Promise).

### Task 2: Create the use case HTML page
Create `use-cases/01-contract-review-and-analysis/index.html` with:
- Same head (fonts, meta) as portal
- Header with logo "LAI" (links back to portal) and page title "Contract Review & Analysis"
- Main content area with these sections:
  a. **Upload section** — drag-and-drop zone + file input for contract upload (PDF/DOCX)
  b. **Analysis results panel** — appears after "upload"; shows:
     - Risk score (circular gauge or badge, color-coded)
     - Summary (text block)
     - Clause table (clause name, type, risk level, deviation from standard)
     - Deviations list with recommended fallback language
  c. **Contract history sidebar or section** — list of previously analyzed contracts (from mock DB)
- Footer with link back to portal
- All semantic HTML, accessible, keyboard-navigable

### Task 3: Create the use case CSS
Create `use-cases/01-contract-review-and-analysis/styles.css`:
- Import/copy the CSS variables from portal (`:root` block)
- Reuse portal patterns: header, card, button, link styles
- Add use-case-specific styles:
  - Upload drop zone (dashed border, hover state)
  - Risk score badge (green/yellow/red based on score)
  - Clause table (striped rows, responsive)
  - Results panel layout (two-column on desktop, stacked on mobile)

### Task 4: Create the use case JavaScript
Create `use-cases/01-contract-review-and-analysis/app.js`:
- Import placeholder API modules
- Handle file upload (drag-and-drop + click)
- On upload: show loading state → call inference API → display results
- Populate clause table and deviations from API response
- Populate contract history from database API
- Wire up any interactive elements (expand clause details, export results)

### Task 5: Update the portal to link to this use case
In `portal/index.html`:
- Change "Use Case 1" card title to "Contract Review & Analysis"
- Change card description to real text from PRD
- Change card link `href` to `../use-cases/01-contract-review-and-analysis/index.html`
- Update the off-canvas nav "Use Case 1" link similarly
- Use a document/contract icon for the card

### Task 6: Verify and polish
- Open `use-cases/01-contract-review-and-analysis/index.html` in browser (via static server)
- Confirm all styles match portal (same fonts, colors, cards, buttons)
- Confirm upload → loading → results flow works with mock data
- Confirm responsive layout (desktop two-column, mobile stacked)
- Confirm accessibility (keyboard, focus, aria labels, skip link)
- Confirm "Back to Portal" link works

## Technical Notes

### Files to Create
- `use-cases/01-contract-review-and-analysis/index.html`
- `use-cases/01-contract-review-and-analysis/styles.css`
- `use-cases/01-contract-review-and-analysis/app.js`
- `use-cases/01-contract-review-and-analysis/api/rag-pipeline.js`
- `use-cases/01-contract-review-and-analysis/api/database.js`
- `use-cases/01-contract-review-and-analysis/api/inference.js`

### Files to Modify
- `portal/index.html` — Update card 1 and nav link 1

### Existing Patterns to Follow
- Portal header: `<header class="header">` with `.header-inner`, `.logo`, `.logo-mark`
- Portal cards: `.card`, `.card-icon`, `.card-title`, `.card-text`, `.card-link`
- CSS variables: all `--color-*`, `--font-*`, `--shadow-*`, `--radius-*` from portal `:root`
- Responsive: `grid` with `auto-fit, minmax(280px, 1fr)`

## Checklist
- [ ] Task 1: Placeholder API modules created (rag-pipeline, database, inference)
- [ ] Task 2: Use case HTML page created with upload, results, and history sections
- [ ] Task 3: Use case CSS created using portal style variables
- [ ] Task 4: Use case JS wires upload → API → results display
- [ ] Task 5: Portal card 1 and nav link updated to point to use case
- [ ] Task 6: Visual/functional verification complete

## Stop Condition
Exit when ALL of the following are true:
- All 6 files in "Files to Create" exist and are non-empty
- `portal/index.html` card 1 title reads "Contract Review & Analysis" and links to the use case
- The use case page loads in a browser, shows header with "LAI" logo and back link
- File upload interaction triggers mock analysis and populates results (risk score, clauses, deviations)
- All CSS uses the portal's Style Guide variables (no hardcoded colors outside `:root`)
- Page is responsive (two-column desktop, stacked mobile)
