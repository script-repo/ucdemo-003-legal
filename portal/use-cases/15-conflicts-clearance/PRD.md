# PRD: Conflicts Clearance

**Use Case Rank:** 15 of 30  
**Folder:** `use-cases/15-conflicts-clearance/`  
**References:** [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md), [Style Guide](../../../docs/style-guide.md)

---

## 1. Overview

**One-line description:** Automates initial conflicts check using party names and matter data; flags potential conflicts for attorney review; speeds onboarding and reduces risk of missed conflicts....

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | 5 | 80% faster intake in agentic case when combined with intake; $90K benefit. |
| **Impact** | 7 | Faster clearance; fewer bottlenecks at intake. |
| **Complexity** | 8 | High: integration with conflicts DB, ethical rules, and intake workflow; sensitive. |

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

Automates initial conflicts check using party names and matter data; flags potential conflicts for attorney review; speeds onboarding and reduces risk of missed conflicts.

---

## 5. User Personas

- **Intake / Conflicts Analyst:** Runs checks daily; wants speed and accuracy.
- **Conflicts Attorney:** Makes final call; needs clear evidence and audit trail.
- **Partner:** Wants fast turnaround to capture work.

---

## 6. User Stories

- As intake, I want an initial conflicts screen from matter parties so I can escalate only when needed.
- As conflicts attorney, I want clear flags and source references so I can make decisions quickly.
- As a partner, I want clearance before client contact so we don’t put relationships at risk.

---

## 7. User Journey

1. New matter request includes party and matter description.
2. System queries conflicts DB and optionally public sources; produces initial screen.
3. Conflicts attorney reviews and clears or escalates; matter proceeds.

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
