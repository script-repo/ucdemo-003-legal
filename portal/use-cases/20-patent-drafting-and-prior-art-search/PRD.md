# PRD: Patent Drafting and Prior Art Search

**Use Case Rank:** 20 of 30  
**Folder:** `use-cases/20-patent-drafting-and-prior-art-search/`  
**References:** [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md), [Style Guide](../../../docs/style-guide.md)

---

## 1. Overview

**One-line description:** Assists with application drafting, prior art search, and office action response; reduces cycle time while requiring attorney oversight for inventorship and strategy....

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | 5 | Specialized tools (e.g., Otto IP, IP Author); patent bar and USPTO considerations. |
| **Impact** | 8 | Faster drafting and prior art identification; must preserve inventorship and confidentiality. |
| **Complexity** | 9 | High: domain expertise, PTO integration, and strict confidentiality. |

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

Assists with application drafting, prior art search, and office action response; reduces cycle time while requiring attorney oversight for inventorship and strategy.

---

## 5. User Personas

- **Patent Attorney:** Drafts and prosecutes; needs accuracy and confidentiality.
- **Inventor:** Provides technical input; wants clear process.
- **IP / General Counsel:** Oversees policy and risk (e.g., inadvertent disclosure).

---

## 6. User Stories

- As a patent attorney, I want a first draft of claims and description from inventor input so I can refine and file faster.
- As an inventor, I want my disclosure turned into a structured draft so I can review before formal filing.
- As IP counsel, I want prior art summaries and relevance so I can advise on freedom to operate.

---

## 7. User Journey

1. Inventor disclosure or attorney notes are captured.
2. System generates draft application or prior art report; attorney reviews and revises.
3. Draft is finalized and filed; AI use is documented per firm policy.

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
