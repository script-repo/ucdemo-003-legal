# PRD: Automated Contract Redlining and Clause Comparison

**Use Case Rank:** 7 of 30  
**Folder:** `use-cases/07-automated-contract-redlining-and-clause-comparison/`  
**References:** [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md), [Style Guide](../../../docs/style-guide.md)

---

## 1. Overview

**One-line description:** Automatically compares draft to firm standard and generates redline; negotiators see exactly what changed and can accept/reject; reduces back-and-forth and version control errors....

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | 7 | Often bundled with contract review; identifies deviations and produces redlines. |
| **Impact** | 8 | Reduces cycle time and review effort; ensures consistency with standards. |
| **Complexity** | 6 | Requires clause library and comparison logic; integrates with review workflow. |

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

Automatically compares draft to firm standard and generates redline; negotiators see exactly what changed and can accept/reject; reduces back-and-forth and version control errors.

---

## 5. User Personas

- **Transactional Attorney:** Negotiates daily; wants speed and clarity of changes.
- **Paralegal:** Prepares first drafts and tracks versions.
- **Legal Operations:** Maintains templates and approves deviations.

---

## 6. User Stories

- As an attorney, I want a redline against our standard NDA so I can send one round of comments quickly.
- As a counterparty, I want clear markup of proposed changes so I can respond precisely.
- As legal ops, I want version history and approval trail for audit.

---

## 7. User Journey

1. User uploads counterparty draft and selects standard or template.
2. System aligns clauses and generates redline with comments or suggested language.
3. Attorney reviews, adjusts, and sends to counterparty; cycle repeats until execution.

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
