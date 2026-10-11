# Design tokens (original to Dii-faceeditor)

Dark-first UI so the photo is the brightest thing on screen. Light theme mirrors it. Tokens are implemented as CSS custom properties in `src/styles/tokens.css` (Phase 1).

| Token | Dark | Light |
|-------|------|-------|
| --bg | #0F1013 | #F6F5F2 |
| --surface | #191B20 | #FFFFFF |
| --surface-2 | #23262D | #ECEAE5 |
| --text | #F2F2F0 | #16171A |
| --text-dim | #A3A7B0 | #5B5F68 |
| --accent | #8F7CFF | #5B45E0 |
| --accent-text | #0F1013 | #FFFFFF |
| --danger | #FF6B6B | #C93535 |
| --focus | #FFD166 | #8A5A00 |

- Contrast: text on bg and surface >= 7:1 (dim text >= 4.5:1); accent controls >= 3:1 against their surface.
- Type: system UI stack (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`), no web fonts (no third-party requests). Scale 12/14/16/20/28 px; weight 400/600.
- Spacing: 4 px base; radii 8 (controls) / 16 (sheets) / 999 (chips). Elevation via surface tone, not shadows.
- Motion: 120-200 ms ease-out; disabled under reduced motion.
- Icons: original 24 px stroke icons (2 px stroke, round caps), drawn in-repo as inline SVG.
- Logo/wordmark: "Dii" in the accent, "faceeditor" in text; no gradients, no imitation of any existing product.
