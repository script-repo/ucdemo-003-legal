# PRD: Legal Research

**Use Case Rank:** 2 of 30  
**Folder:** `use-cases/02-legal-research/`  
**References:** [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md), [Style Guide](../../../docs/style-guide.md)

---

## 1. Overview

**One-line description:** Reduces time from hours to minutes to find on-point cases and secondary sources; improves consistency across matters; supports junior attorneys and solo/small firms with limited research staff. Value ...

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | 9 | 58% of legal professionals use AI for legal research; foundational use case with strong vendor ecosystem (Westlaw, Lexis+, etc.). |
| **Impact** | 9 | Faster identification of relevant authority; 25% reduction in cognitive load; enables associates to focus on argument and strategy. |
| **Complexity** | 5 | Moderate: depends on quality of training data and citation integrity; RAG and retrieval-grade systems reduce hallucination risk. |

---

## 3. Goals and Success Criteria

### 3.1 Goals

- Deliver the capability described in the overview within the portal (or linked experience).
- Conform to the Legal AI Architecture Specification (integration, security, data, style).
- Support the user stories and journey below.

### 3.2 Success Criteria

- Target users can complete the primary user journey with clear value (e.g. time saved, consistency, or quality).
- All UI follows the Style Guide; accessibility and responsiveness meet portal standards.
- Access and material actions are audited per architecture spec.

---

## 4. Value to the Law Firm

Reduces time from hours to minutes to find on-point cases and secondary sources; improves consistency across matters; supports junior attorneys and solo/small firms with limited research staff. Value in billable efficiency and outcome quality.

---

## 5. User Personas

- **Associate Attorney:** Time-pressed; needs fast, accurate answers; must verify citations before use.
- **Partner:** Wants strategic view and contrary authority; values time savings for team.
- **Research Librarian / Knowledge Manager:** Curates sources and trains attorneys; needs usage and quality metrics.

---

## 6. User Stories

- As an associate, I want natural-language queries to return cited, relevant cases and statutes so I can build memos faster.
- As a partner, I want the system to suggest contrary authority so we can address weaknesses before filing.
- As a librarian, I want research trails and source quality scores so we can train and audit research practices.

---

## 7. User Journey

1. Attorney poses research question in plain language (or from matter memo).
2. System retrieves and ranks cases, statutes, and secondary sources; generates short summaries with citations.
3. Attorney reviews results, follows citations, and integrates into memo or brief.
4. Feedback (e.g., “not helpful”) improves future retrieval where supported.

---

## 8. Key UI Elements (Suggested)

- Entry from portal (card and/or nav link).
- Primary workflow surface (upload, search, form, or chat as appropriate).
- Results or output view (summary, list, document, or dashboard).
- Export, share, or save where applicable.

*To be refined in design; must conform to Style Guide.*

---

## 9. Dependencies

- **Portal:** Entry point and navigation (see Architecture Specification).
- **Auth/RBAC:** As defined in Architecture Specification; this use case declares which roles can access it.
- **Data/APIs:** Per use case (e.g. DMS, matter system, or internal AI API); to be specified in technical design.

---

## 10. Out of Scope (This Use Case)

- Replacement of attorney judgment or ethical responsibility.
- Processing of client/confidential data outside the approved on-prem/in-region environment.
- Net-new visual design; all UI follows the Style Guide.

---

## 11. References

- [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md)
- [Style Guide](../../../docs/style-guide.md)
- [Portal PRD](../../../docs/PRD.md)
- [Software Specification](../../../docs/SOFTWARE-SPEC.md)

---

*This PRD supports parallel development. Update as the use case is scoped and built.*
