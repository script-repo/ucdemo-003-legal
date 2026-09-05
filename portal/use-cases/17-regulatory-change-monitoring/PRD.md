# PRD: Regulatory Change Monitoring

**Use Case Rank:** 17 of 30  
**Folder:** `use-cases/17-regulatory-change-monitoring/`  
**References:** [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md), [Style Guide](../../../docs/style-guide.md)

---

## 1. Overview

**One-line description:** Monitors regulations and guidance; summarizes changes and impact for relevant practices; supports client alerts and internal training....

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | 5 | Important for compliance-heavy industries; adoption growing. |
| **Impact** | 8 | Early awareness of new rules; proactive compliance and client alerts. |
| **Complexity** | 7 | Requires regulatory data feeds, taxonomy, and distribution workflow. |

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

Monitors regulations and guidance; summarizes changes and impact for relevant practices; supports client alerts and internal training.

---

## 5. User Personas

- **Compliance Attorney:** Owns regulatory response; needs accuracy and timeliness.
- **Practice Attorney:** Wants relevant alerts only; may author client updates.
- **Legal Operations:** Manages subscriptions and audit trail.

---

## 6. User Stories

- As compliance counsel, I want daily summaries of relevant regulatory updates so I can prioritize action.
- As a practice group, I want alerts when our practice area is affected so we can update clients.
- As legal ops, I want a log of what was reviewed and acted on for audit.

---

## 7. User Journey

1. System ingests regulatory sources (feeds, registers, guidance).
2. GenAI summarizes new and amended items and maps to practice/jurisdiction.
3. Subscribers receive digests; actions and acknowledgments are tracked.

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
