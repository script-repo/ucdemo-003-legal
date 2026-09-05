"""
Generate a subfolder and PRD.md for each of the 30 Legal AI use cases.
Run from project root: python scripts/generate_use_case_prds.py
Output: use-cases/NN-slug/PRD.md for each use case.
"""
import re
import sys
from pathlib import Path

script_dir = Path(__file__).resolve().parent
if str(script_dir) not in sys.path:
    sys.path.insert(0, str(script_dir))

from legal_ai_use_cases_data import USE_CASES


def name_to_slug(name: str) -> str:
    """Convert use case name to kebab-case slug (no parens)."""
    s = name.split("(")[0].strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[-\s]+", "-", s).strip().lower()
    return s


def prd_content(uc: dict, index: int) -> str:
    slug = name_to_slug(uc["name"])
    nn = f"{index:02d}"
    arch_ref = "../../docs/Legal_AI_Architecture_Specification.md"
    style_ref = "../../docs/style-guide.md"
    return f"""# PRD: {uc["name"]}

**Use Case Rank:** {uc["rank"]} of 30  
**Folder:** `use-cases/{nn}-{slug}/`  
**References:** [Legal AI Architecture Specification]({arch_ref}), [Style Guide]({style_ref})

---

## 1. Overview

**One-line description:** {uc["value"][:200]}...

This use case can be built in parallel with other Legal AI use cases. It conforms to the shared architecture (auth, data residency, audit, style) defined in the Legal AI Architecture Specification.

---

## 2. Ranking Context

| Dimension | Score (1–10) | Notes |
|-----------|--------------|--------|
| **Adoption** | {uc["adoption"]} | {uc["adoption_note"]} |
| **Impact** | {uc["impact"]} | {uc["impact_note"]} |
| **Complexity** | {uc["complexity"]} | {uc["complexity_note"]} |

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

{uc["value"]}

---

## 5. User Personas

{chr(10).join("- **" + p.split(":")[0].strip() + ":** " + (p.split(":", 1)[1].strip() if ":" in p else p) for p in uc["personas"])}

---

## 6. User Stories

{chr(10).join("- " + s for s in uc["user_stories"])}

---

## 7. User Journey

{chr(10).join(f"{i}. {step}" for i, step in enumerate(uc["journey"], 1))}

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

- [Legal AI Architecture Specification]({arch_ref})
- [Style Guide]({style_ref})
- [Portal PRD](../../docs/PRD.md)
- [Software Specification](../../docs/SOFTWARE-SPEC.md)

---

*This PRD supports parallel development. Update as the use case is scoped and built.*
"""


def main():
    project_root = script_dir.parent
    use_cases_dir = project_root / "use-cases"
    use_cases_dir.mkdir(exist_ok=True)

    for uc in USE_CASES:
        index = uc["rank"]
        slug = name_to_slug(uc["name"])
        nn = f"{index:02d}"
        folder = use_cases_dir / f"{nn}-{slug}"
        folder.mkdir(exist_ok=True)
        path = folder / "PRD.md"
        path.write_text(prd_content(uc, index), encoding="utf-8")
        print(f"Written: {path}")

    print(f"Done: {len(USE_CASES)} use case PRDs in {use_cases_dir}")


if __name__ == "__main__":
    main()
