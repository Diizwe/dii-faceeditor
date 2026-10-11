# Experiment for run 3 (not applied): brightness-dependent range tolerance in the Smooth blur

Hypothesis: a fixed absolute range sigma in the bilateral base smooths dark skin more than light skin, which would explain the cross-group parity failure
(detail retention at max: MST 9-10 0.67, 7-8 0.89, 5-6 0.72, 3-4 0.66, 1-2 0.87; median 0.72).

Patch to try in `BLUR` in `src/gl/renderer.ts`:

```glsl
float rs = uRange * clamp(dot(c0, vec3(0.2126, 0.7152, 0.0722)) / 0.5, 0.5, 1.5);
// ... and use rs instead of uRange in the range weight
```

Measure with `node tests/browser/tools.mjs smooth` (about 12 minutes); keep it only if every group still passes and the parity checks improve.
