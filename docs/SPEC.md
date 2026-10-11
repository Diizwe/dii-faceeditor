# Dii-faceeditor: Feature spec (v1)

Source: `build/PLAN.md`. This file turns the plan into build-ready definitions. Anything not stated here defaults to the plan.

## Global rules
- Everything runs client-side; no third-party requests; models and code are served from the app's own origin.
- Edits are an ordered list of **operations** (settings + strokes), never pixels. Undo/redo moves a pointer in the list. Export replays the list on the full-resolution original.
- **Fixed pipeline order**: 1 clean-up (Heal, Object erase) on original pixels -> 2 geometry (crop/rotate applied at the end of the geometry stage's coordinate map; Reshape, Liquify) -> 3 mask-driven retouch (Smooth, Whiten, Eyes, Makeup) -> 4 colour (Light & colour, Filters) -> 5 background composite last.
- EXIF orientation is applied before any detection. Landmarks and the background mask are re-mapped through warps, never re-detected.
- **Mask rules** (all mask tools): never touch pixels outside the mask; feather every mask edge (feather width = 1.5% of face width, min 2 px at preview scale); default strength is capped at about 40% of the range.
- **Face-relative units**: `fw` = width of the picked face's bounding box in the working image. Filter radii and brush defaults are multiples of `fw`, so preview (2048 px long edge) and full-res export match.
- Strength sliders show 0-100; internal gain is `s/100`. The default value of every strength slider is <= 40.
- One face is "active" at a time (face picker). Tools with a face mask edit only the active face; "Apply to all faces" is a toggle (default off).

## Tools

| # | Tool | Tier | Controls (range, default) | Mask / region | Technique (short) |
|---|------|------|---------------------------|---------------|-------------------|
| 1 | Face picker | 1 | tap a face outline to select | n/a | BlazeFace detector -> face mesh + iris on each face crop |
| 2 | Crop & rotate | 1 | aspect (free/1:1/4:5/3:4/9:16/16:9/original), straighten -45..45 deg (0), rotate 90 deg steps, flip H/V | n/a | Crop rect + rotation in the final geometry stage; lossless on export |
| 3 | Smooth | 1 | strength 0-100 (35), fine-detail keep 0-100 (70) | face-mesh outline minus eyes, brows, lips, nostrils; narrowed by skin-colour model from that face's cheeks | mid-frequency suppression, edge-aware (guided/bilateral), sigma_s = 0.012 fw, detail floor retained |
| 4 | Heal | 1 | brush radius 0.5-6% of image short side (2%), tap or drag | brush circle | deterministic patch search + seamless clone, CPU worker, computed once at full-res |
| 5 | Whiten | 1 | strength 0-100 (40) | inner-lip polygon thresholded to bright pixels | lower saturation / lift lightness of yellow hues (h 35-80 deg) only |
| 6 | Eyes | 1 | brighten 0-100 (30), clarity 0-100 (35) | eye polygons, iris disc | local contrast + small iris brightness lift |
| 7 | Light & colour | 1 | exposure -2..+2 EV (0), contrast -100..100 (0), warmth -100..100 (0), saturation -100..100 (0) | whole image | tone curves + white balance in linear light, P3-aware |
| 8 | Before/after | 1 | press-and-hold compare; drag-split compare | n/a | renders operation list with and without edits |
| 9 | Reshape | 2 | jaw width, chin length, nose width, nose length, eye size, eye distance, lip fullness, face width: each -100..100 (0); max displacement at 100 = 6% fw | face mesh; background near the face moves slightly (tight falloff, 0.35 fw) | thin-plate-spline warp over landmark control points |
| 10 | Liquify | 2 | brush size 2-25% of short side (8%), strength 0-100 (30), mode push/pucker/bloat/reconstruct | brush | painted displacement map applied in a shader |
| 11 | Makeup | 2 | lip tint colour+opacity 0-60 (25), blush 0-60 (20), brow fill 0-60 (20) | lip / cheek / brow polygons | multiply/soft-light blends, feathered |
| 12 | Filters | 2 | 8 looks, strength 0-100 (40) | whole image | 3D LUT mix |
| 13 | Background | 3 | mode remove / blur / replace (colour, gradient or user image); blur 0-100 (50), edge refine 0-100 (60) | person mask | selfie/meet segmenter on face crop + from-scratch guided filter at hair edges |
| 14 | Object erase | 3 | brush radius (3%), tap-and-brush | brush | PatchMatch-style inpainting, worker, result cached |

Tier 1+2 = v1; Tier 3 = v1.1 if Phase 4 slips. Minimum v1: Face picker, Crop & rotate, Light & colour, Before/after, Smooth, Heal.

## UI flow (mobile first, 390 x 844 CSS px reference)
1. **Start**: single screen, "Choose a photo" button + drop zone. Copy states that photos never leave the device. HEIC accepted (desktop Chromium/Edge/Firefox via lazy-loaded libheif; iOS Safari via native decode).
2. **Editor**: top bar (Back/New, Undo, Redo, Compare, Export). Canvas fills the middle with pinch-zoom and two-finger pan; one finger is reserved for the active tool. Bottom: horizontally scrolling tool bar (icon + label, 56 px tall), and above it the active tool's panel (max 40% of screen height).
3. **Face picker**: if >1 face is detected, numbered outlines appear on the canvas; tap one to make it active. With one face it is auto-selected.
4. **Compare**: hold the Compare button to show the original; or drag the split handle in compare mode.
5. **Export**: sheet with format (JPEG default, PNG), quality 70-100 (92), "Strip location data" always on (not optional), optional "mark as edited" metadata. Shows progress for tiled export, then the system share/save.
6. **Errors**: plain-language, never silent (too large, unsupported format, out of memory -> retry at lower tile size, model failed to load -> tool disabled with reason).

Touch targets >= 44 x 44 CSS px. Works with keyboard on desktop (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, hold Space = compare). Respects `prefers-reduced-motion` and light/dark.

## Non-functional budgets
- 12 MP photo (4032 x 3024) loads to a 2048 px preview in <= 2.5 s on the CPU-throttled iPhone 13 Pro Max emulation profile; each shader pass at the 2048 px preview: <= 16 ms GPU on real hardware (checked after handoff), software-GPU budget in Chromium defined in `spec/thresholds.json`.
- Export tile size <= 2048 px with margin >= max(radius of any pass) + 8 px; peak texture memory budget 256 MB; max texture size assumed 4096.
- Initial JS < 400 KB gzip; models and libheif load on demand with progress and are cached (Cache Storage); persistent storage requested in Phase 5.
