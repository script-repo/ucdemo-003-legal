# Legal AI Architecture Specification

**Version:** 1.0  
**Status:** Draft  
**Scope:** Portal and all Legal AI use cases (parallel-buildable)

---

## 1. Purpose

This document defines the shared architecture for the Legal AI Portal and every generative/agentic AI use case delivered through it. Use cases are built in **parallel** in separate subfolders; each use case PRD references this specification for consistency in integration, security, data, and UX.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Legal AI Portal (Shell)                           │
│  Header │ Hero │ Cards │ Off-canvas Nav │ Entry to Use Cases            │
└─────────────────────────────────────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┬───────────────┬─────────────────────┐
    ▼               ▼               ▼               ▼                     ▼
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ...   ┌─────────┐
│ Use     │   │ Use     │   │ Use     │   │ Use     │           │ Use     │
│ Case 01 │   │ Case 02 │   │ Case 03 │   │ Case 04 │           │ Case 30 │
│ (PRD)   │   │ (PRD)   │   │ (PRD)   │   │ (PRD)   │           │ (PRD)   │
└─────────┘   └─────────┘   └─────────┘   └─────────┘           └─────────┘
       │               │               │               │                     │
       └───────────────┴───────────────┴───────────────┴─────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
            │ Auth / RBAC  │   │ Audit Log    │   │ Data (on-prem)│
            └──────────────┘   └──────────────┘   └──────────────┘
```

- **Portal:** Single entry point; branding, navigation, and links to each use case.
- **Use cases:** Independently buildable applications or routes; each has its own PRD in `use-cases/NN-<slug>/PRD.md`.
- **Shared:** Authentication, audit logging, data residency, and UX (Style Guide) are common.

---

## 3. Infrastructure

| Concern | Standard |
|--------|----------|
| **Hosting** | Kubernetes (Nutanix Kubernetes Platform / NKP). Portal and each use case may be one or more services. |
| **Source code** | GitHub ([`script-repo/ucdemo-003-legal`](https://github.com/script-repo/ucdemo-003-legal)). One repo; use-case code lives in subfolders. |
| **Data residency** | On-prem / in-region only. No client or confidential data in public cloud. |
| **CI/CD** | GitOps: GitHub Actions builds container images to GHCR; Flux reconciles the `deploy/gitops/ntnx-use-cases/` overlay into the cluster. See [`deploy/gitops/README.md`](../deploy/gitops/README.md). |

---

## 4. Integration with the Portal

- **Entry:** Each use case is reachable from the portal via a navigation link and/or a landing card. Route or URL pattern: e.g. `/use-cases/<id>` or `/app/<slug>`.
- **Integration patterns (per use case):**
  - **Same app:** Use case is a route in the portal SPA (shared auth, shared shell).
  - **Embedded:** Use case runs in an iframe or micro-frontend; portal provides chrome and auth context.
  - **Separate app:** Use case is a separate deployment; portal links to it (SSO or token handoff).
- **Contract:** Each use case PRD must state which pattern it uses and what context (user, matter, tenant) it receives from the portal.

---

## 5. Security and Compliance

- **Authentication:** Centralized (SSO/IdP). Portal and use cases must not implement their own login unless explicitly scoped (e.g. client-facing sub-app).
- **Authorization:** RBAC by role and optionally by practice area or matter. Each use case PRD defines which roles can access it.
- **Audit:** All access to the portal and to each use case must be logged (who, when, what) for compliance and security review.
- **Data:** No export or processing of confidential data outside the approved environment. Use-case backends must run on-prem or in the approved region.

---

## 6. Data and AI Services

### 6.1 Inference Endpoints (Nutanix AI)

Each live use case calls the Nutanix enterprise AI endpoints through a
same-origin server-side proxy — the browser never holds the API key.

| Capability | Endpoint | Model |
|-----------|----------|-------|
| **Chat completions** | `https://nai.hpoc.nutanix.com:443/api/v1/chat/completions` | `llama3-1-8b` |
| **Embeddings** | `https://nai.hpoc.nutanix.com:443/api/v1/embeddings` | `llama-3-2-embed` |

- Authentication: Bearer token, injected server-side only:
  - **Local dev:** `server.py` reads `NAI_API_KEY` from the environment
    (or a gitignored `.env`) and adds the header when proxying `/api/ai/*`.
  - **Production:** nginx's built-in envsubst templating substitutes
    `${NAI_API_KEY}` into [`nginx/default.conf.template`](../nginx/default.conf.template)
    at container start, from a Kubernetes Secret — see
    [`deploy/gitops/README.md`](../deploy/gitops/README.md#secrets--created-out-of-band-never-committed).
  - The key is never hardcoded in source, never baked into the container
    image, and never committed to Git.

### 6.2 Shared Databases (Kubernetes — `ntnx-use-cases` namespace)

| Service | Type | Cluster DNS | Port | Purpose |
|---------|------|-------------|------|---------|
| **pg-db** | PostgreSQL 16 | `pg-db.ntnx-use-cases.svc.cluster.local` | 5432 | Relational data: contracts, matters, metadata, audit |
| **ch-db** | ChromaDB | `ch-db.ntnx-use-cases.svc.cluster.local` | 8000 | Vector DB: clause embeddings, semantic search |

- PostgreSQL database: `legal_ai`, user: `legal_admin`, password from the
  `legal-ai-secrets` Kubernetes Secret (never in Git).
- ChromaDB: persistent storage on PVC, telemetry disabled. Reserved for
  future RAG use cases; no live use case calls it yet.
- Both are ClusterIP services, deployed via
  [`deploy/gitops/ntnx-use-cases/postgres.yaml`](../deploy/gitops/ntnx-use-cases/postgres.yaml)
  and [`chromadb.yaml`](../deploy/gitops/ntnx-use-cases/chromadb.yaml); use
  cases connect via cluster DNS.

### 6.3 General Data Rules

- **AI/LLM:** Use cases call the Nutanix endpoints above or internal approved services. No ad-hoc use of public LLM APIs with client data unless explicitly approved.
- **Storage:** Matter and document data remain in firm DMS or approved stores; use cases integrate via defined APIs or connectors.
- **Confidentiality:** All use cases must document how they handle client and matter data (retention, deletion, access control).

---

## 7. User Experience and Style

- **Style Guide:** All portal and use-case UI must conform to [Style Guide](style-guide.md) (raslg.com-derived). No net-new visual language.
- **Accessibility:** Semantic HTML, keyboard navigation, screen-reader support, and `prefers-reduced-motion` respect.
- **Responsiveness:** Desktop and tablet; mobile as per policy. Each use case PRD may call out any special layout needs.

---

## 8. Use Case Folder Structure

- **Location:** `use-cases/NN-<slug>/` where `NN` is a two-digit index (01–30) and `<slug>` is a short, kebab-case name.
- **Contents:** At minimum, `PRD.md` for that use case. Optional: `README.md`, design notes, or use-case-specific specs.
- **Parallel build:** Teams can develop use cases independently; each PRD is self-contained and references this architecture spec for shared concerns.

---

## 9. References

- [Software Specification](SOFTWARE-SPEC.md)
- [Style Guide](style-guide.md)
- [Portal PRD](PRD.md)
- Use case PRDs: `use-cases/01-*/PRD.md` through `use-cases/30-*/PRD.md`

---

*This specification ensures consistent architecture across all Legal AI use cases while allowing parallel development.*
