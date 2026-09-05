# Legal AI Use Cases (Parallel Build)

This folder contains **30 use cases** for the Legal AI Portal. Each use case has its own subfolder and PRD so teams can build them in parallel.

## Architecture

All use cases conform to the **[Legal AI Architecture Specification](../../docs/Legal_AI_Architecture_Specification.md)**:

- Portal entry (nav + card)
- Shared auth, RBAC, audit, data residency
- [Style Guide](../../docs/style-guide.md) for all UI

## Structure

```
use-cases/
├── README.md (this file)
├── 01-contract-review-and-analysis/
│   └── PRD.md
├── 02-legal-research/
│   └── PRD.md
├── ...
└── 30-legal-training-and-cle/
    └── PRD.md
```

Each `NN-<slug>/PRD.md` includes:

- Overview and value to the law firm
- Ranking (adoption, impact, complexity)
- Goals and success criteria
- User personas, user stories, user journey
- Key UI elements, dependencies, out of scope
- References to the Architecture Specification and Style Guide

## Use Case List (1–30)

| # | Use Case |
|---|----------|
| 01 | [Contract Review and Analysis](01-contract-review-and-analysis/PRD.md) |
| 02 | [Legal Research](02-legal-research/PRD.md) |
| 03 | [Document Summarization](03-document-summarization/PRD.md) |
| 04 | [Contract Risk Analysis](04-contract-risk-analysis/PRD.md) |
| 05 | [Legal Intake and Triage](05-legal-intake-and-triage/PRD.md) |
| 06 | [Meeting Transcription and Summarization](06-meeting-transcription-and-summarization/PRD.md) |
| 07 | [Automated Contract Redlining and Clause Comparison](07-automated-contract-redlining-and-clause-comparison/PRD.md) |
| 08 | [E-Discovery and Document Review](08-e-discovery-and-document-review/PRD.md) |
| 09 | [Document Drafting](09-document-drafting/PRD.md) |
| 10 | [M&A Due Diligence](10-ma-due-diligence/PRD.md) |
| 11 | [Client Communication and Status Updates](11-client-communication-and-status-updates/PRD.md) |
| 12 | [Timekeeping and Time Entry](12-timekeeping-and-time-entry/PRD.md) |
| 13 | [eBilling and Compliance Review](13-ebilling-and-compliance-review/PRD.md) |
| 14 | [Matter Budgeting and Pricing](14-matter-budgeting-and-pricing/PRD.md) |
| 15 | [Conflicts Clearance](15-conflicts-clearance/PRD.md) |
| 16 | [Knowledge Management and Precedent Search](16-knowledge-management-and-precedent-search/PRD.md) |
| 17 | [Regulatory Change Monitoring](17-regulatory-change-monitoring/PRD.md) |
| 18 | [Litigation Strategy and Predictive Analytics](18-litigation-strategy-and-predictive-analytics/PRD.md) |
| 19 | [Deposition and Transcript Analysis](19-deposition-and-transcript-analysis/PRD.md) |
| 20 | [Patent Drafting and Prior Art Search](20-patent-drafting-and-prior-art-search/PRD.md) |
| 21 | [Compliance Monitoring and Reporting](21-compliance-monitoring-and-reporting/PRD.md) |
| 22 | [Lease and Real Estate Document Review](22-lease-and-real-estate-document-review/PRD.md) |
| 23 | [Employment Agreement and HR Document Review](23-employment-agreement-and-hr-document-review/PRD.md) |
| 24 | [Policy Drafting and Gap Analysis](24-policy-drafting-and-gap-analysis/PRD.md) |
| 25 | [Subpoena and Information Request Response](25-subpoena-and-information-request-response/PRD.md) |
| 26 | [Legal Hold Management](26-legal-hold-management/PRD.md) |
| 27 | [Contract Lifecycle Management](27-contract-lifecycle-management/PRD.md) |
| 28 | [Immigration Document Preparation](28-immigration-document-preparation/PRD.md) |
| 29 | [Board and Governance Document Preparation](29-board-and-governance-document-preparation/PRD.md) |
| 30 | [Legal Training and CLE](30-legal-training-and-cle/PRD.md) |

## Regenerating PRDs

To regenerate all PRDs from the central data (e.g. after editing `scripts/legal_ai_use_cases_data.py`):

```bash
python scripts/generate_use_case_prds.py
```
