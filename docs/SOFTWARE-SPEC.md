# Legal AI Portal — Software Specification

**Version:** 1.0  
**Status:** Draft  
**Reference:** [Style Guide](style-guide.md)

---

## 1. Scope

The Legal AI Portal is a web application that serves as a single entry point for five generative and agentic AI use cases within the law firm. It provides:

- A unified landing experience (hero + feature cards)
- Consistent navigation and branding
- Entry points to each AI use case (routes or embedded experiences)
- A single design system and style compliance (raslg.com-derived Style Guide)

The portal does **not** include the AI backends or use-case-specific logic in this spec; it defines the shell, navigation, auth (if any), and integration points.

---

## 2. Users and Audience

- **Primary users:** To be confirmed — internal only (attorneys, paralegals, staff) vs internal + external clients.
- **Implication:** Authentication, authorization (RBAC), and routing may differ (e.g. internal SSO vs client login). The architecture will support both models; final choice will be documented in the PRD.

---

## 3. Infrastructure and Deployment

| Concern | Decision |
|--------|----------|
| **Hosting** | Kubernetes (container-based). The portal runs as one or more containerized workloads. |
| **Source code** | Internal / self-hosted Git repository. No public cloud source hosting required. |
| **Data residency** | On-prem / in-region only. No client or confidential data in public cloud. All processing and storage of sensitive data must remain within the approved environment. |

### 3.1 Deployment Model

- Portal frontend (and optional BFF/API) packaged as container images.
- Deployed to a Kubernetes cluster (managed or self-hosted).
- Use case applications may run as separate services in the same cluster or as linked deployments; integration is via navigation (links) or embedded views (iframes or micro-frontends), to be decided per use case.

### 3.2 Non-Functional Requirements

- **Availability:** Target to be set by operations (e.g. 99.5% uptime for internal use).
- **Performance:** Initial load and navigation should feel responsive; static assets and fonts should be optimized (e.g. minification, caching).
- **Compliance:** Design and operations must support confidentiality and any applicable bar or regulatory requirements; data must not leave on-prem/in-region boundaries.

---

## 4. Technology Stack

- **Stack:** To be chosen. Options include React, Vue, or Svelte for the frontend; optional Node or other backend for auth and API aggregation.
- **Requirement:** The chosen stack must support:
  - Implementation of the [Style Guide](style-guide.md) (CSS variables, fonts, components).
  - Responsive layout (hero, cards, off-canvas nav).
  - Accessibility (semantic HTML, keyboard nav, reduced motion).
- **Component approach:** Use a component library that can be themed to the Style Guide, or build custom components that conform to it.

---

## 5. Security

- **Authentication:** Mechanism TBD (e.g. SSO, OAuth, internal IdP). Must integrate with firm identity provider if internal-only.
- **Authorization:** Role-based access control (RBAC) for portal and per use case where applicable (e.g. by practice area or role).
- **Audit logging:** Log access to the portal and entry into each use case for compliance and security review.
- **Data handling:** No storage or transmission of client/confidential data outside the approved on-prem/in-region environment. Use case backends must adhere to the same policy.

---

## 6. Integration with Use Cases

- **Portal responsibilities:** Present navigation (header + off-canvas menu), landing page (hero + cards), and entry points to the five use cases.
- **Entry mechanisms:** Each use case is reachable via:
  - Navigation menu link, and/or
  - Card link on the landing page.
- **Integration style:** One of:
  - **Route + separate app:** Portal links to a different path or subdomain that hosts the use case app.
  - **Embedded:** Use case runs in an iframe or micro-frontend slot within the portal.
  - **Same app:** Use case implemented as a route within the same SPA (monorepo or separate deploy).
- **Deployment:** Use cases may be deployed as separate services on the same Kubernetes cluster or as part of the same deployment; the spec does not mandate a single pattern. Each use case’s deployment and API contract will be specified when use cases are defined. See [PRD](PRD.md) for use case placeholders (Use Case 1–5).

---

## 7. Style and UX Compliance

- All portal UI (and use case UI when hosted within the portal) must conform to the [Style Guide](style-guide.md).
- The Style Guide is derived from raslg.com and defines colors, typography, components (header, hero, cards, off-canvas nav, buttons/links), and global behavior (reduced motion, responsiveness, accessibility).

---

## 8. Out of Scope (v1)

- Public-facing marketing website (portal is internal/internal+client only).
- Native mobile apps (portal is web; responsive web is in scope).
- Implementation of the five AI use case backends (separate specs).

---

## 9. References

- [Style Guide](style-guide.md) — Visual and interaction design.
- [PRD](PRD.md) — Product requirements, personas, portal UX, and use case placeholders.

---

*This document is the software specification for the Legal AI Portal. It will be updated when the technology stack, auth model, and use case integration details are finalized.*
