# PRD: M&A Due Diligence

**Use Case Rank:** 10 of 30  
**Folder:** `use-cases/10-ma-due-diligence/`  
**References:** [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md), [Style Guide](../../../docs/style-guide.md)

---

## 1. Overview

**One-line description:** Extracts key clauses (e.g., change-of-control, assignment) from large document sets; generates diligence reports and issues lists; reduces deal timeline and improves consistency across deals....

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | 6 | Growing in deal teams; automates contract extraction and report generation. |
| **Impact** | 9 | Faster data room review; consistent extraction of change-of-control, key terms, and risks. |
| **Complexity** | 9 | High: VDR integration, deal-specific taxonomies, and coordination across teams. |

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

Extracts key clauses (e.g., change-of-control, assignment) from large document sets; generates diligence reports and issues lists; reduces deal timeline and improves consistency across deals.

---

## 5. User Personas

- **M&A Attorney:** Leads diligence; needs speed and completeness.
- **Associate:** Reviews contracts; wants clear tasks and fewer repetitive reads.
- **Client (Biz Dev / Corp Dev):** Wants fast, clear summary of risks and obligations.

---

## 6. User Stories

- As a deal attorney, I want all material contracts summarized and key terms extracted so I can build the issues list in days not weeks.
- As a junior associate, I want automated identification of change-of-control and consent requirements so I can focus on exceptions.
- As deal lead, I want a single report and risk summary for the client so we can present clearly.

---

## 7. User Journey

1. VDR or document set is connected; system ingests and classifies documents.
2. GenAI extracts parties, dates, key clauses, and risks; populates data sheet or report.
3. Team reviews extractions, adds commentary, and produces client-ready report.

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
