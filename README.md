# Dii-faceeditor

Browser-based portrait retouching, built entirely by AI with $0 of infrastructure, licences or APIs. Every edit runs on your device. MIT licensed.

**Live:** https://diizwe.github.io/dii-faceeditor/ &middot; **Demo video:** `docs/demo/dii-faceeditor-demo.mp4`

## What it does
Face picker, crop & rotate, Smooth, Heal, Whiten (beta), Eyes (beta), Light & colour, Reshape, Liquify, Makeup, Filters, compare and split view, full-resolution tiled export that keeps the colour profile and removes location data, offline use. Background and Object erase are planned for v1.1.

## Read next
- `docs/CASE_STUDY.md` how it was built and how it went
- `docs/KNOWN_GAPS.md` where v1 is below its own bar
- `docs/TESTING_KIT.md` iPhone, other browsers and the Facetune benchmark (needs a human)
- `docs/SPEC.md`, `docs/RUBRICS.md`, `spec/thresholds.json` the plan, rubrics and frozen acceptance numbers
- `build/LOG.md` the build log, `PROGRESS.json` the build state, `THIRD_PARTY.md` licences

## Develop
```
npm ci
npm run dev          # copies the face models, starts Vite
npm test             # unit tests
npm run build        # type-check + production build into dist/
npm run test:browser # Chromium suite; needs python3 + pillow + numpy
node tests/browser/tools.mjs <light|smooth|heal|whiten|eyes|filters|makeup|parity|sheets>  # per-tool suites on the 33-photo grid (10-15 min each; run one at a time)
```
Demo video: `video/` (Remotion; `node video/capture.mjs` then `npx remotion render` inside `video/`).
