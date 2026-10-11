# Build log

Running totals (updated each run): runs used 1 of 50 · infrastructure spend $0 · licences $0 · Claude subscription: logged by Dii.

## Run 1: Phase 0 (2026-10-11)

**Asked:** build Dii-faceeditor autonomously from the approved plan; create public repo, Pages deploy via Action, 4-hourly scheduled runs.

**Produced / happened (in order)**
1. Repo creation via the GitHub connector returned 403 (integration could not create repos). Stopped per instruction; Dii created the repo and installed the Claude GitHub App. Push verified. A leftover empty branch `probe-push` remains (the proxy refuses branch deletion); harmless.
2. Pages deploy first failed ("Pages not enabled"); the Pages API is blocked by the agent proxy, so Dii enabled Pages (source: GitHub Actions). Re-run succeeded; live at https://diizwe.github.io/dii-faceeditor/.
3. Scheduled run created (`trig_01PHSqXnvQhVJjwyTU7WHcgQ`, every 4 h). Discovery: scheduled sessions carry **no connectors**, so the plan is snapshotted at `build/PLAN.md` and runs use plain git and `curl` for deploy checks.
4. Environment re-check (decision: trust measurement over the earlier probe): WebGL2 + `EXT_color_buffer_float` OK in `@sparticuz/chromium` (SwiftShader, max texture 8192). `@vladmandic/human-models` 3.0.4 (MIT) contains blazeface, facemesh(+attention), iris, selfie, meet. `rvm.bin` is present and is GPL-3.0: **not used**. Hugging Face, jsDelivr, Wikimedia and raw.githubusercontent.com are reachable (the earlier probe said blocked); `api.github.com`/`codeload` for unattached repos are blocked. Decision: the app still depends only on npm and from-scratch code; the wider reach is used only to source test photos and pinned skills.
5. 20 skills installed at pinned commits into `.agent-skills/` (not `.claude/skills/`, so a phase loads only what the plan lists). Sweep for hidden Unicode, pipe-to-shell and long encoded blobs: no findings. Remotion renders a test clip using the workspace Chromium (`browserExecutable`), so the demo-video tool is confirmed.
6. Wrote `docs/SPEC.md`, `docs/DESIGN_TOKENS.md`, `docs/RUBRICS.md`, `spec/thresholds.json` (frozen).

**Decisions and reasoning**
- Thresholds are written as numbers now so later phases cannot move the goalposts; the reviewer-agent rule (within 10% of threshold) is encoded in the file.
- Dark-first UI so the photo is the brightest element; no web fonts, keeping to "no third-party requests".
- Per-pass software-GPU time budget deliberately left to be measured in Phase 1, then frozen at 1.5x; logged here as a deliberate deferral.

**Broke / open:** none open.

### Run 1, later in the run: test photos, gate
- Sourcing: Wikimedia Commons crawl (CC0 / CC BY / public domain, NC/SA/ND excluded, >=1000 px short side, >=2005 when dated). Commons rate-limits hard: API 429s with Retry-After, originals 10 min. Dead ends: first crawl crashed (URI too long, fixed with smaller batches); thumbnails need standard widths (330 px, not 320); one `pkill -f` killed my own shell. Visual triage on contact sheets of 100 thumbnails; skin-tone groups are approximate visual estimates.
- Result: 33 photos, groups 6/8/8/5/6, minimum coverage met, gaps logged in `testdata/COVERAGE.md` (group shots 1/3, low light thin, 48 MP original pending).
- Phase 0 gate: reviewer agent (same model, fresh context) found 13 defects (missing metrics for Before/after, export ICC/dimensions, third-party requests, model cache; unfrozen runtime budget; defaults over the 40% cap; vacuous halo metric). All applied before freezing; logged in the thresholds changelog.
- Phase 0 used 1 run, within the plan's 1-2 estimate. Phase 0 done.
