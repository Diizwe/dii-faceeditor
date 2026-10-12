# Case study: a Facetune-class editor, built by AI, for $0

**Thesis.** An AI can plan, build, test and ship a real portrait retouching app, with no infrastructure, licence or API cost, if every claim is tied to a number that was fixed before the work started.

## What was built
Dii-faceeditor: a free, open-source (MIT) portrait editor that runs entirely in the browser. Photos never leave the device. Live at https://diizwe.github.io/dii-faceeditor/ , demo video in `docs/demo/`.
Tools: face picker, crop & rotate, Smooth, Heal, Whiten (beta), Eyes (beta), Light & colour, before/after compare and split, Reshape, Liquify, Makeup, Filters, tiled full-resolution export that keeps the colour profile and strips location data, offline use. Background and Object erase were moved to v1.1.

## How it was run
- A plan and frozen acceptance thresholds (`spec/thresholds.json`) were written first; later changes had to be logged with the numbers that prompted them (five entries).
- A scheduled build session ran in 13 runs (about 15 hours of wall-clock time including a four-hour schedule early on; later runs chained back to back). Each run read `PROGRESS.json`, took a lock, built, ran the automated suite, pushed to `main` (GitHub Pages deploys on every push) and logged to `build/LOG.md`.
- A 33-photo test grid of CC0 / CC BY / public-domain portraits across five skin-tone groups; every objective metric was evaluated per group.
- A fresh-context reviewer agent scored before/after sheets against `docs/RUBRICS.md` at each phase gate. Rule: after three failed attempts a task is cut to its simplest working version or deferred, and logged.

## Cost
Infrastructure $0, licences $0, third-party API calls $0 (the app makes none). The one real cost is the Claude subscription, logged by Dii (not by the agent).

## Timeline (runs)
| Phase | Runs | Outcome |
|-------|------|---------|
| 0 Spec and setup | 1 | spec, rubrics, frozen thresholds, 33-photo grid, skills installed |
| 1 Skeleton | 2-3 | upload, renderer, history, crop & rotate, face picker, exporter; 12 MP loads in 1.6-2.1 s throttled; lossless export dE 0 |
| 2 Core retouch | 2-6 | Light & colour, compare, Smooth, Eyes, Whiten, Heal; closed with documented exceptions |
| 3 Reshape and more | 6-10 | Filters, Makeup, Reshape, Liquify; closed with documented exceptions |
| 4 AI tools | 11 | Background built and tested, deferred to v1.1 on quality; Object erase not built |
| 5 Polish | 12 | offline, onboarding, performance pass (slowest pass 43 ms, limit 250) |
| 6 Handoff | 13 | docs, demo video, testing kit |

## What AI did well
- Turned a plan into thresholds and tests before writing features, then kept to them.
- Found real bugs through its own tests: Adobe RGB photos exported with raw colours; a renderer that lost its context when a second photo was opened; skin hue shifting up to 23 degrees from a plain white-balance control; iris landmarks numbered opposite to the eye outlines.
- Wrote everything performance-critical itself: JPEG and PNG writers, guided filter, inpainting, warp, renderer.
- Reported gaps instead of hiding them (see `docs/KNOWN_GAPS.md`).

## What AI did badly
- Subjective quality. The reviewer scored four of the nine rubric-scored tools below 4.0 even after tuning, and several fixes traded one defect for another.
- Judging its own metrics: two frozen thresholds had to be reinterpreted (colour round-trip, straight lines) and each time that was logged, which is a cost of freezing numbers before measuring.
- Time spent on tools that were not minimum v1 while Heal and Smooth parity stayed open.
- Wasted effort on infrastructure friction (a rate-limited photo download, shell commands that killed their own shell).

## Benchmark
Not yet run. Facetune needs the phone app and a card for the trial, which only the owner can do: see the testing kit (`docs/TESTING_KIT.md`). Results, with intervals and where Facetune still wins, are to be added here.

## Honest summary
v1 meets its objective checks for the minimum tools (face picker, crop & rotate, Light & colour, compare, Smooth, Heal) apart from the gaps listed, and ships six more tools of mixed quality. Whether it is "Facetune-class" is the open question the benchmark answers.
