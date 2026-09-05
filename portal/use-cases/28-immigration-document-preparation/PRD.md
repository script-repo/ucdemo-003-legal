# PRD: Immigration Document Preparation

**Use Case Rank:** 28 of 30  
**Folder:** `use-cases/28-immigration-document-preparation/`  
**References:** [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md), [Style Guide](../../../docs/style-guide.md)

---

## 1. Overview

**One-line description:** Drafts forms and supporting letters from client input; checks completeness and consistency; reduces back-and-forth and errors in high-volume practices....

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | 7 | 40% daily usage in immigration practice; repetitive forms and evidence. |
| **Impact** | 7 | Faster petitions and consistency; supports high volume. |
| **Complexity** | 6 | Form-specific logic and jurisdiction; multilingual in some flows. |

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

Drafts forms and supporting letters from client input; checks completeness and consistency; reduces back-and-forth and errors in high-volume practices.

---

## 5. User Personas

- **Immigration Attorney:** High volume; wants speed and accuracy.
- **Paralegal:** Manages intake and assembly; needs structure.
- **Client:** Often non-native speaker; wants clarity and support.

---

## 6. User Stories

- As an immigration attorney, I want forms pre-filled from client intake so I can review and file faster.
- As a paralegal, I want a checklist of supporting documents so we don’t miss evidence.
- As a client, I want clear instructions and status so I can plan.

---

## 7. User Journey

1. Client completes intake; system gathers facts and documents.
2. Draft forms and letters are generated; attorney reviews and adjusts.
3. Package is assembled and filed; status is tracked.

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
