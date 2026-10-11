# Dii-faceeditor

Browser-based portrait retouching, built autonomously by AI. Every edit runs on the user's device. MIT licensed.

Live: https://diizwe.github.io/dii-faceeditor/

## Develop

```
npm ci
npm run dev          # copies the face models, starts Vite
npm test             # unit tests
npm run build        # type-check + production build into dist/
npm run test:browser # Chromium suite (iPhone 13 Pro Max emulation, software WebGL2); needs python3 + pillow + numpy
```

Build state lives in `PROGRESS.json`; the build log is in `build/LOG.md`; the frozen acceptance thresholds are in `spec/thresholds.json`.
Third-party components: see `THIRD_PARTY.md`.
