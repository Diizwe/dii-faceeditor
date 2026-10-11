# Third-party components

Everything below is installed from npm and served from this app's own origin. The app makes no third-party requests.

| Component | Licence | Use |
|-----------|---------|-----|
| react, react-dom | MIT | UI |
| zustand | MIT | state |
| @vladmandic/human | MIT | runs the face models (TensorFlow.js WebGL backend), loaded on demand |
| @vladmandic/human-models | MIT | BlazeFace detector, face mesh and iris models (only these three are shipped) |
| libheif-js | LGPL-3.0 | decodes HEIC on browsers without native HEIC support; its own lazily loaded chunk, fetched only when such a file is opened |

Written from scratch in this repository: the JPEG and PNG writers, the Heal inpainting, the edge-aware smoothing and mask feathering, the colour pipeline and the WebGL2 renderer.
Not used on purpose: the `rvm.bin` model (GPL-3.0).

Test photos are in `testdata/` with per-photo licence and author in `testdata/ATTRIBUTION.md` (CC0, CC BY, public domain).
