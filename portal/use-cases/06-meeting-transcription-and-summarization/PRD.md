# PRD: Meeting Transcription and Summarization

**Use Case Rank:** 6 of 30  
**Folder:** `use-cases/06-meeting-transcription-and-summarization/`  
**References:** [Legal AI Architecture Specification](../../../docs/Legal_AI_Architecture_Specification.md), [Style Guide](../../../docs/style-guide.md)

---

## 1. Overview

**One-line description:** Creates searchable transcripts and concise summaries of client calls, internal meetings, and strategy sessions; improves handoffs and reduces “he said/she said” disputes; supports billing and matter n...

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | 8 | Gartner top-6; widely adopted in corporate legal; quick to deploy after training. |
| **Impact** | 7 | Written record and key-point summaries; supports matter documentation and knowledge capture. |
| **Complexity** | 3 | Low; many off-the-shelf tools; considerations for confidentiality and retention. |

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

Creates searchable transcripts and concise summaries of client calls, internal meetings, and strategy sessions; improves handoffs and reduces “he said/she said” disputes; supports billing and matter narratives.

---

## 5. User Personas

- **Attorney:** Runs client and case meetings; wants minimal friction and good accuracy.
- **Paralegal:** Captures actions and deadlines; needs structured output.
- **Legal Operations:** Manages tools and retention; needs security and compliance controls.

---

## 6. User Stories

- As an attorney, I want a transcript and bullet summary after every client call so I can update the file without note-taking.
- As a paralegal, I want action items extracted from meetings so I can track follow-ups.
- As compliance, I want transcripts of regulated discussions to be retained per policy.

---

## 7. User Journey

1. Meeting is held (in-person, video, or phone); tool records or receives upload.
2. System produces transcript and optional summary with key points and action items.
3. Host reviews, edits if needed, and attaches to matter or knowledge base.

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
