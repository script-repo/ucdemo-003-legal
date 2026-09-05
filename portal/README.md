# Legal AI Portal — Web UI

Static portal implementing the [Style Guide](../docs/style-guide.md): hero, header with off-canvas nav, and five use-case cards.

## Run locally

Serve the `portal` folder with any static server. Examples:

```bash
# Python
python -m http.server 8080 --directory portal

# Node (npx)
npx serve portal -p 8080

# Open index.html directly in a browser (no server)
# Note: some features work best with a local server to avoid CORS with fonts.
```

Then open `http://localhost:8080` (or the port you used).

## Structure

- `index.html` — Semantic markup: header, hero, cards, off-canvas nav
- `styles.css` — CSS variables and components from the Style Guide
- `app.js` — Off-canvas nav open/close, focus management, Escape key

## Conformance

- Colors, typography, and components follow `docs/style-guide.md`
- Responsive: multi-column cards on desktop, stacked on small screens
- Respects `prefers-reduced-motion`
- Skip link, aria attributes, and keyboard support for accessibility

## Next steps

- Replace placeholder "Use Case 1–5" copy and links when use cases are defined
- Replace logo "LAI" with firm logo/branding as needed
- Integrate into a framework (React/Vue/Svelte) or keep as static shell
