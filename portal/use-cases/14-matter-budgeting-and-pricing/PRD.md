# PRD: Matter Budgeting and Pricing

**Use Case Rank:** 14 of 30  
**Folder:** `use-cases/14-matter-budgeting-and-pricing/`  
**References:** [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md), [Style Guide](../../../docs/style-guide.md)

---

## 1. Overview

**One-line description:** Uses historical matters to suggest budgets and alternative fee structures; reduces partner time on reporting and improves predictability for clients....

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | 5 | 67% less partner reporting time in cited case; $150K benefit. |
| **Impact** | 8 | Better matter economics and AFAs; data-driven pricing. |
| **Complexity** | 7 | Requires historical matter data, matter type taxonomy, and partner adoption. |

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

Uses historical matters to suggest budgets and alternative fee structures; reduces partner time on reporting and improves predictability for clients.

---

## 5. User Personas

- **Partner:** Owns client relationship and pricing; wants data without manual analysis.
- **Legal Operations:** Owns matter management and reporting.
- **Client:** Wants predictability and value.

---

## 6. User Stories

- As a partner, I want suggested budgets and fee options from similar matters so I can pitch confidently.
- As legal ops, I want actuals vs. budget and variance reasons so we can improve estimates.
- As a client, I want transparent, predictable pricing so I can plan.

---

## 7. User Journey

1. New matter is set up; type and scope are captured.
2. System suggests budget and/or AFA options from similar past matters.
3. Partner selects or adjusts; matter is tracked; actuals feed future models.

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
