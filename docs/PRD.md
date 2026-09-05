# Legal AI Portal — Product Requirements Document (PRD)

**Version:** 1.0  
**Status:** Draft  
**References:** [Software Specification](SOFTWARE-SPEC.md), [Style Guide](style-guide.md)

---

## 1. Goals and Success Criteria

### 1.1 Portal Goals

- Provide a single, professional entry point for law firm staff (and optionally clients) to access generative and agentic AI tools.
- Establish consistent branding and navigation across all AI use cases.
- Reduce friction to discover and use each use case via a clear landing experience and nav.

### 1.2 Success Criteria

- Users can open the portal and understand at a glance what AI capabilities are available.
- Users can reach any of the five use cases in one or two clicks (from landing or nav).
- All UI conforms to the Style Guide (raslg.com look and feel).
- Portal is responsive and usable on desktop and tablet; mobile support per policy.
- Accessibility meets agreed targets (e.g. keyboard navigable, reduced motion respected).

### 1.3 Use Case Goals

- Each use case will have its own goals and success criteria; see placeholder sections (Use Case 1–5) below.

---

## 2. User Personas

| Persona | Role | Needs |
|--------|------|--------|
| **Attorney** | Lawyer | Quick access to research, contract review, or other AI tools; minimal training. |
| **Paralegal** | Support | Reliable access to document prep, summarization, or intake tools. |
| **Admin / IT** | Operations | Portal stability, clear navigation, and (if applicable) user/role management. |

Additional personas (e.g. client user) may be added when audience is confirmed (internal-only vs internal + external).

---

## 3. Portal UX

### 3.1 Landing

- **Structure:** Mirror raslg.com: hero section + content cards.
- **Hero:**
  - Full-width, ~60–66% viewport height.
  - Background with blue gradient overlay (Style Guide: #6EC1E4 → #015795).
  - Centered headline (e.g. value proposition for Legal AI).
  - Optional short white divider line under headline.
- **Cards:**
  - Below the hero, a row (desktop) or stack (mobile) of cards.
  - Each card: icon, heading, short description, and “Enter” or “Find out more” link.
  - Cards map to the five use cases (one card per use case, or grouped as needed).
  - Card style per Style Guide: white, rounded corners, subtle shadow, blue headings and links.

### 3.2 Navigation

- **Header:** Persistent; logo top-left, hamburger icon top-right.
- **Off-canvas menu:** Opens from the right when hamburger is clicked.
  - Items: Home + five use cases (+ any sub-items like “Practice Areas” / “Locations” style).
  - Style: dark gray background (#54595F), white text, separators, hover state, close button (blue square with X).
- **Entry into use cases:** From nav link or from card link on landing; each use case is a distinct area (route or embedded experience).

### 3.3 Entry into Use Cases

- From **nav:** User selects a use case from the off-canvas menu → navigates to that use case view.
- From **landing:** User clicks a card link → same destination.
- Each use case is a distinct area (e.g. route like `/use-case/1` or embedded view). Exact routing and whether use cases are separate apps or in-app routes will be decided during implementation.

---

## 4. Feature List

### 4.1 Portal (v1)

| Feature | Description | Priority |
|---------|-------------|----------|
| Landing page | Hero + cards per Style Guide | P0 |
| Header | Logo + hamburger; sticky over hero | P0 |
| Off-canvas nav | Right-side panel; Home + five use cases; close button | P0 |
| Use case entry | Links from nav and cards to each use case | P0 |
| Responsive layout | Desktop multi-column cards; mobile stacked; same nav | P0 |
| Style compliance | All UI follows Style Guide | P0 |
| Auth (if required) | Login / SSO; gating of portal or use cases | P1 |
| Dashboard (optional) | Post-login home with recent or favorites | P2 |
| Audit logging | Log portal and use case access | P1 |

### 4.2 Use Cases (Placeholders)

- **Use Case 1:** TBD — name, description, user flow, key UI elements.
- **Use Case 2:** TBD — name, description, user flow, key UI elements.
- **Use Case 3:** TBD — name, description, user flow, key UI elements.
- **Use Case 4:** TBD — name, description, user flow, key UI elements.
- **Use Case 5:** TBD — name, description, user flow, key UI elements.

Use case features will be detailed once the five use cases are named and scoped.

---

## 5. Style Compliance

- All portal and use case UI must conform to the [Style Guide](style-guide.md).
- No net-new visual language; reuse raslg.com-derived palette, typography, and components (header, hero, cards, off-canvas nav, buttons/links).

---

## 6. Out of Scope (v1)

- Public marketing site.
- Native mobile app (responsive web only).
- Implementation of AI/LLM backends (separate projects).

---

## 7. Use Case Placeholders (Detail)

The following sections reserve space for the five use cases. Fill in when names and scope are defined.

---

### Use Case 1

| Field | Content |
|-------|--------|
| **Name** | TBD |
| **One-line description** | TBD |
| **User flow** | Entry from portal → main actions → outcome (TBD) |
| **Key UI elements** | e.g. upload, chat, results view (TBD) |
| **Style** | Same palette, typography, and component rules as portal and Style Guide |

---

### Use Case 2

| Field | Content |
|-------|--------|
| **Name** | TBD |
| **One-line description** | TBD |
| **User flow** | Entry from portal → main actions → outcome (TBD) |
| **Key UI elements** | TBD |
| **Style** | Same as portal and Style Guide |

---

### Use Case 3

| Field | Content |
|-------|--------|
| **Name** | TBD |
| **One-line description** | TBD |
| **User flow** | TBD |
| **Key UI elements** | TBD |
| **Style** | Same as portal and Style Guide |

---

### Use Case 4

| Field | Content |
|-------|--------|
| **Name** | TBD |
| **One-line description** | TBD |
| **User flow** | TBD |
| **Key UI elements** | TBD |
| **Style** | Same as portal and Style Guide |

---

### Use Case 5

| Field | Content |
|-------|--------|
| **Name** | TBD |
| **One-line description** | TBD |
| **User flow** | TBD |
| **Key UI elements** | TBD |
| **Style** | Same as portal and Style Guide |

---

## 8. References

- [Software Specification](SOFTWARE-SPEC.md)
- [Style Guide](style-guide.md)

---

*This PRD will be updated when the five use cases are named and scoped, and when auth and audience decisions are finalized.*
