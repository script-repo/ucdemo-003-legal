# PRD: Legal Intake and Triage

**Use Case Rank:** 5 of 30  
**Folder:** `use-cases/05-legal-intake-and-triage/`  
**References:** [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md), [Style Guide](../../../docs/style-guide.md)

---

## 1. Overview

**One-line description:** Incoming requests are categorized by type, region, risk, and urgency and routed to the right team; reduces lag and improves client satisfaction; enables reporting on volume and types....

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | 7 | Gartner top-6; growing adoption for in-house and firms; 80% faster intake in agentic deployments. |
| **Impact** | 8 | Faster routing, consistent categorization, and better SLAs; ~$90K annual benefit in cited agentic case. |
| **Complexity** | 6 | Requires workflow integration, stakeholder alignment, and change management for routing rules. |

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

Incoming requests are categorized by type, region, risk, and urgency and routed to the right team; reduces lag and improves client satisfaction; enables reporting on volume and types.

---

## 5. User Personas

- **Intake Coordinator:** First line; wants speed and minimal errors; needs override and audit.
- **Practice Manager:** Allocates work; needs volume and type metrics.
- **Requestor (internal client):** Wants fast acknowledgment and clear expectations.

---

## 6. User Stories

- As intake staff, I want the system to suggest matter type and urgency from email content so I can route in one click.
- As a practice lead, I want dashboards of intake by type and geography so I can allocate capacity.
- As a requestor, I want confirmation and estimated response time so I know my request was received.

---

## 7. User Journey

1. Request arrives (email, portal, or form).
2. GenAI extracts parties, subject, jurisdiction, and urgency; suggests matter type and routing.
3. Intake team confirms or overrides; matter is created and assigned.
4. Requestor receives acknowledgment; matter appears in matter management.

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
