# Legal AI Portal — Style Guide

This document is the single source of truth for visual design of the Legal AI Portal. All UI must conform to this guide. The design is derived from [raslg.com](https://raslg.com) (Robertson, Anschutz, Schneid, Crane & Partners PLLC).

---

## 1. Color Palette

### Primary / Hero / Overlays

| Token | Hex | Usage |
|-------|-----|--------|
| `--color-primary` | **#6EC1E4** | Sky blue; hero gradient top, logo outline |
| `--color-primary-dark` | **#015795** | Logo background, icon circles, hero gradient bottom |
| `--color-primary-bright` | **#0184F7** | Links, primary buttons, close button |
| `--color-primary-light` | **#3EA5FF** | Lighter accent |
| `--color-primary-muted` | **#4054B2** | Purplish blue (optional) |

### Neutrals

| Token | Hex | Usage |
|-------|-----|--------|
| `--color-white` | **#FFFFFF** | Page background, hero text, card background, nav text |
| `--color-secondary` | **#54595F** | Sidebar/nav background, secondary surfaces |
| `--color-text` | **#7A7A7A** | Muted body text |
| `--color-text-body` | **#3d3d3d** | Primary body text |
| `--color-text-muted` | **#838383** | Inputs, buttons, secondary copy |
| `--color-black` | **#000000** | Shadows, strong contrast |

### Accent (CTAs / Success)

| Token | Hex | Usage |
|-------|-----|--------|
| `--color-accent` | **#61CE70** | Success, positive actions |
| `--color-accent-dark` | **#23A455** | Hover/pressed accent |

### Usage Rules

- **Hero overlay**: Linear gradient from `#6EC1E4` (top) to `#015795` (bottom).
- **Cards/surfaces**: White (`#FFFFFF`) with subtle box shadow.
- **Links and primary actions**: `#0184F7`.
- **Sidebar / off-canvas nav**: Background `#54595F`; text white; hover = darker gray (e.g. `#454a50`).

---

## 2. Typography

### Font Stack

- **Body**: `Montserrat`, sans-serif
- **Headings (primary)**: `Roboto`
- **Headings (secondary)**: `Roboto Slab`
- **Accent / emphasis**: `Roboto`

Load from Google Fonts (or self-host):

- Montserrat (400)
- Roboto (400, 500, 600)
- Roboto Slab (400)

### Type Scale

| Role | Font | Weight | Size | Line height | Color |
|------|------|--------|------|-------------|--------|
| Body | Montserrat, sans-serif | 400 | 14px | 1.8 | #3d3d3d |
| Inputs / buttons (copy) | Montserrat, sans-serif | 400 | 13px | 1.8 | #838383 |
| Headings (primary) | Roboto | 600 | context-dependent | — | White on hero; blue on cards |
| Headings (secondary) | Roboto Slab | 400 | — | — | — |
| Accent / emphasis | Roboto | 500 | — | — | — |
| Card headings | Roboto or Montserrat bold | 700 | — | — | #0184F7 or #015795 |

### Base CSS

```css
html {
  font-size: 62.5%;
}

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  font-family: 'Montserrat', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.8;
  color: #3d3d3d;
  background: #fff;
}

body, button, input, select, textarea {
  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  line-height: 1.8;
  color: #838383;
}
```

---

## 3. Components

### 3.1 Logo Block

- Dark blue rectangle background: `#015795`
- Text: "RAS" (or firm acronym) in white, sans-serif
- Optional: light blue outline `#6EC1E4` around the rectangle

### 3.2 Header

- Fixed or sticky at top
- Logo top-left
- Hamburger icon (three horizontal white lines) top-right
- Header sits over hero; can be transparent or with slight overlay

### 3.3 Hero Section

- Full viewport width
- Height: ~60–66% of viewport height (e.g. `min-height: 66vh`)
- Background: image or gradient; overlay = linear gradient from `#6EC1E4` to `#015795`
- Content: centered; headline in white, bold (Roboto 600)
- Optional: short white horizontal divider line under headline

### 3.4 Cards

- Background: white `#FFFFFF`
- Rounded corners (e.g. `border-radius: 8px` or `12px`)
- Subtle box shadow (e.g. `0 4px 12px rgba(0,0,0,0.08)`)
- Structure per card:
  - Circular icon (solid `#015795` or `#0184F7`), top
  - Uppercase heading in blue (Roboto or Montserrat bold)
  - Body text in gray `#7A7A7A` or `#3d3d3d`
  - Optional: "Find out more" / "Enter" link in `#0184F7`

### 3.5 Primary Button / Link

- Color: `#0184F7`
- Underline on hover (or visible focus state)
- Use for primary CTAs and in-card links

### 3.6 Off-Canvas Navigation

- Slides in from the **right**
- Background: `#54595F`
- Text: white
- List items: thin light gray separators between
- Hover: darker gray background
- Close button: square, background `#0184F7`, white "X" icon, top-right of panel
- Dropdowns: downward chevron (▼) for items with sub-menus; sub-items slightly indented

### 3.7 Icons

- Use Font Awesome 6 or equivalent for: menu (hamburger), close (X), chevrons, feature icons (e.g. search, checkmark, briefcase)
- Icon color: white on dark backgrounds; blue or gray on light backgrounds per context

---

## 4. Global Behavior

### Motion

- Respect `prefers-reduced-motion: reduce`: set `transition-duration: 0s` and `transition-delay: 0s` when user prefers reduced motion.

### Responsiveness

- Mobile-first: navigation collapses to hamburger; off-canvas panel on all breakpoints or only small (e.g. &lt; 768px).
- Desktop: hero full width; cards in multi-column grid (e.g. 3 columns).
- Mobile: cards stack vertically; same header and nav pattern.

### Accessibility

- Semantic HTML (header, nav, main, section, article, footer)
- Sufficient contrast per palette (WCAG 2.1 AA where applicable)
- Keyboard navigable; focus visible
- Screen reader friendly (labels, aria where needed)
- Do not rely on color alone for meaning

---

## 5. CSS Variables Reference

Use these in stylesheets for consistency:

```css
:root {
  /* Primary */
  --color-primary: #6EC1E4;
  --color-primary-dark: #015795;
  --color-primary-bright: #0184F7;
  --color-primary-light: #3EA5FF;
  --color-primary-muted: #4054B2;
  /* Neutrals */
  --color-white: #FFFFFF;
  --color-secondary: #54595F;
  --color-text: #7A7A7A;
  --color-text-body: #3d3d3d;
  --color-text-muted: #838383;
  --color-black: #000000;
  /* Accent */
  --color-accent: #61CE70;
  --color-accent-dark: #23A455;
  /* Typography */
  --font-body: 'Montserrat', sans-serif;
  --font-heading: 'Roboto', sans-serif;
  --font-heading-secondary: 'Roboto Slab', serif;
}
```

---

*Source: raslg.com (RAS Legal Group). Extracted for Legal AI Portal. All portal UI must conform to this Style Guide.*
