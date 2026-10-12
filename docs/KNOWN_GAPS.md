# Known gaps (v1)

Nothing here is hidden: these are the places where v1 is below the bar set in `spec/thresholds.json` or in the rubrics, with the evidence.

## Below the bar
| Area | What is wrong | Evidence |
|------|---------------|----------|
| **Smooth, cross-group parity** | Every per-group check passes, but two ratio metrics differ more across skin-tone groups than the frozen 15% rule: detail kept at maximum strength (22% off the median) and blemish reduction (30% off). The cause is not settled (one experiment, brightness-scaled range tolerance, made it worse). | `build/EXPERIMENT_smooth_range.md`, build log runs 3-9 |
| **Heal** | Fails the texture check (interior std ratio 1.34, limit 1.25) on one group when the blemish sits next to stubble, hair or the ear: the filled patch can pick up dark clumps. Works well on open skin. | run 3 heal results |
| **Whiten (beta)** | Under-whitens strongly stained teeth and can go near paper-white on light teeth. Only 7 of 33 test photos show teeth and none in the lightest skin group, so evidence is thin. Reviewer 3.75 on 2 photos. | runs 3-4 |
| **Eyes (beta)** | Objective checks pass; the visible effect is subtle and the iris is only found when it is large enough. Reviewer 4.25. | run 4 |
| **Light & colour** | Passes its checks; reviewer 3.46. Already high-key photos clip when exposure and warmth are stacked. A stronger highlight roll-off broke the monotone-exposure check, so it was not shipped. | run 5 |
| **Makeup** | Objective checks pass (luma correlation >= 0.977). Reviewer 3.6: lip and brow changes are weak on dark skin, blush can look strong on deep-warm skin. | runs 8-10 |
| **Liquify** | Objective checks pass. Reviewer 3.5: the same stroke looks different on different photos and a large brush near clothing edges can tear. | run 10 |
| **Reshape** | Reviewer 4.08 overall, 3.5 on the MST 5-6 group (a tilted, close-up face with patterned clothing). | runs 8-9 |

## Not in v1 (moved to v1.1 by the plan's rule)
- **Background** (blur / colour / gradient behind the person) is built and tested (the person's pixels never change; export matches the preview) but scored about 3.1 in review: halos on dark-on-dark and white-on-white photos, no edge colour decontamination, no light wrap. The button is hidden; add `?v11` to the address to see it.
- **Object erase** was not built.

## Evidence limits
- The test grid has 33 photos; skin-tone groups are visual estimates (Monk scale paired into five), not measurements. Group shots: 1 photo. No photo with glasses and an arm gap for Background.
- The real 54 MP stress photo could not be downloaded (Wikimedia rate limit, three attempts). A synthetic 8000x6000 photo stands in; it passes every Phase 1 check.
- HEIC is wired to a lazy libheif path but was never exercised (no HEIC fixture could be produced offline).
- Crop & rotate has aspect presets, straighten, turns and flips; there are no draggable crop handles.
- Reviewer scores come from a fresh-context copy of the same model looking at before/after sheets, not at 100% crops and not from human raters. They are directional.
- Real-device frame rate and Safari behaviour are untested; that is the testing kit.

## Deviations from the spec
- Reshape and Liquify run last in the pipeline (after retouch and colour) so retouch masks stay aligned; the spec put them before retouch.
- The colour round-trip threshold applies to the lossless export; JPEG at q92 has its own limits (thresholds changelog).
- The Smooth control "Keep fine detail (70)" became "Soften fine texture (30)" to respect the 40% default cap.
