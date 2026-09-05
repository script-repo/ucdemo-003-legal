# PRD: Timekeeping and Time Entry

**Use Case Rank:** 12 of 30  
**Folder:** `use-cases/12-timekeeping-and-time-entry/`  
**References:** [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md), [Style Guide](../../../docs/style-guide.md)

---

## 1. Overview

**One-line description:** Suggests time entries from calendar, emails, and matter activity; improves same-day capture and reduces write-offs; supports realization and matter budgeting....

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | 5 | Emerging; 40-point same-day entry improvement in cited agentic case; $150K benefit. |
| **Impact** | 8 | More accurate and timely entries; better realization and fewer write-downs. |
| **Complexity** | 7 | Requires integration with practice management and billing; behavior change. |

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

Suggests time entries from calendar, emails, and matter activity; improves same-day capture and reduces write-offs; supports realization and matter budgeting.

---

## 5. User Personas

- **Fee Earner:** Resists administrative burden; wants minimal effort and accuracy.
- **Billing Partner:** Reviews write-offs; wants complete and contemporaneous entries.
- **Finance / Legal Operations:** Tracks realization and matter economics.

---

## 6. User Stories

- As an attorney, I want suggested time entries from my calendar and emails so I can log without reconstructing the day.
- As a billing partner, I want fewer write-downs from late or vague entries.
- As finance, I want consistent capture across the firm so we can analyze realization.

---

## 7. User Journey

1. System ingests calendar, emails, and matter activity (with consent).
2. Suggested entries with matter, phase, and description are presented.
3. Attorney approves or edits; entries flow to billing system.

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
