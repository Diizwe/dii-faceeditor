# Test-photo grid: coverage report (Phase 0, 2026-10-11)

**Verdict: minimum coverage met** (>= 24 photos, >= 3 in every skin-tone group): 33 photos, smallest group has 5. The build continues.

| Skin-tone group (visual estimate, MST pairs) | Photos |
|---|---|
| MST 1-2 | 6 |
| MST 3-4 | 8 |
| MST 5-6 | 8 |
| MST 7-8 | 5 |
| MST 9-10 | 6 |

| Lighting x pose | Photos |
|---|---|
| daylight / front | 4 |
| daylight / angled | 5 |
| indoor / front | 14 |
| indoor / angled | 4 |
| low light / front | 2 |
| low light / angled | 4 |

Other: glasses 10, facial hair 8, group shots 1, 48 MP photo pending.

## Gaps (logged, none blocking)
- **Group shots: 1 of 3 target.** Face-picker group metric is reported on whatever group faces exist; add more in a later run.
- **Low light / front: 2** and **indoor is over-represented (18 of 33)**. Cell targets (5 skin groups x 3 lightings x 2 poses = 30) are not each filled; per-group results are reported on available photos only.
- **MST 1-2 is thin on "ordinary" photos.** Light-skinned Europeans on Commons are mostly 19th-century monochrome cartes de visite, which are not representative retouching inputs; the MST 1-2 group is therefore East Asian / Latin American / European colour portraits judged lightest by eye.
- **Labels are approximate visual estimates** by Claude, not measurements. Same person is never split across groups.
- **48 MP stress photo pending.** Chosen: File:Naomi Selvaratnam (33071149821).jpg, 9000x6000, CC BY 4.0. Commons rate-limits original downloads (Retry-After 600 s); fetch once in a later run.
- **Showcase:** no photo has a verified model release, so all are testing-only (`showcase_ok: false`).
- Several sets share one photographer/subject (max 3 photos per person).
