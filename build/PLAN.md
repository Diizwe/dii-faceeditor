# Dii-faceeditor: Build Plan (snapshot of the approved plan, 2026-10-11)

Source of truth: https://claude.ai/code/artifact/9e2812ba-9fa9-415f-8873-82d2c37e19f8 . This is a text extraction of it (tables flattened, diagram omitted).

Dii-faceeditor: Build Plan
 · 
Overview
Dii-faceeditor is a browser-based portrait retouching app with Facetune-class tools, designed and built entirely by AI, with $0 spent on infrastructure, licences or APIs. Facetune is used only once, at the end, as a benchmark.
Portfolio thesis: AI can take a polished consumer product category and rebuild it from the ground up — spec, code, testing and write-up — with a human only approving the plan and testing the result.
Constraints
$0 in infrastructure, licences and APIs: open-source libraries, in-browser models, free hosting. The Claude subscription is the one real cost and is logged openly in the case study.
AI-built: Claude writes the spec, all code, tests and documentation. Dii approves the plan and supplies no files; after that, Claude builds start to finish with no human checkpoints and hands over a finished app ready for testing.
Web-only: one TypeScript codebase. Targets current Chrome, Edge, Firefox and Safari, including iOS Safari, the hardest target.
Original product: own name, UI, icons and code. Facetune's behaviour inspires the feature list; nothing of theirs is copied.
Private by design: every edit runs on the user's device. All code and models are served from the app's own site, so the app makes no third-party requests, and it can work offline after first load (on iPhone, reliably only once added to the Home Screen).
Feature scope
The build covers 14 tools in three tiers; Tier 1 alone is a demo-ready product.
Tool
 | Tier
 | What it does
 | Facetune equivalent
 | 
Face picker
 | 1 · Core
 | Detects every face; tap to choose which one each tool edits
 | Automatic face selection
 | 
Crop & rotate
 | 1 · Core
 | Crop, straighten, rotate, flip
 | Crop
 | 
Smooth
 | 1 · Core
 | Evens skin texture, keeps pores and edges
 | Smooth
 | 
Heal
 | 1 · Core
 | Tap to remove blemishes and spots
 | Heal / Patch
 | 
Whiten
 | 1 · Core
 | Whitens teeth only
 | Whiten
 | 
Eyes
 | 1 · Core
 | Brightens and sharpens eyes
 | Details / Eyes
 | 
Light & colour
 | 1 · Core
 | Exposure, contrast, warmth, saturation
 | Adjust
 | 
Before / after
 | 1 · Core
 | Hold or drag to compare
 | Compare
 | 
Reshape
 | 2 · Pro
 | Slider-driven face sculpting: jaw, nose, eyes, lips
 | Face / Reshape
 | 
Liquify
 | 2 · Pro
 | Free-hand push warp with brush
 | Reshape brush
 | 
Makeup
 | 2 · Pro
 | Lip tint, blush, brow fill
 | Makeup
 | 
Filters
 | 2 · Pro
 | One-tap looks with strength slider
 | Filters
 | 
Background
 | 3 · AI
 | Remove, blur or replace background
 | Backdrop
 | 
Object erase
 | 3 · AI
 | Remove unwanted objects or people
 | Vanish
 | 
Release cut: Tiers 1–2 are v1. Tier 3 stays in the plan but blocks nothing: if Phase 4 slips, the benchmark and write-up run on Tiers 1–2 and Tier 3 ships as v1.1.
Out of scope: video retouching, avatars, text-to-image generation, accounts and cloud sync. Each needs servers or paid models, which break the $0 rule.
Architecture and stack
A single-page web app where every step, from decoding to AI models to export, runs on the user's device.
Edits are stored as a list of settings and brush strokes, not pixels, so undo is instant and export can replay everything on the full-resolution original.
Fixed order: 1) clean-up (Erase, Heal) on the original pixels, 2) geometry (Reshape, Liquify), 3) mask-driven retouch (Smooth, Whiten, Eyes, Makeup), 4) colour (Light, Filters), 5) background composite last. Clean-up strokes then genuinely live in original-image coordinates, and Erase's cached patch stays valid when later edits change. Landmarks and the background mask are re-mapped through the warp, not re-detected. EXIF orientation is applied before any detection runs.
Preview matches export: filter radii scale with face size, not pixel count. Heal and Erase compute their patches once at full resolution in the worker; the preview shows a downscaled copy, so export is never blurrier than preview. An automated check compares each preview against a downscaled export.
Export: rendered in overlapping tiles, with margins wider than the largest warp, blur or filter radius so no seams show, because many phone GPUs cap textures at 4096px and iOS Safari kills tabs that use too much memory. Location data is stripped from EXIF.
Colour: iPhone photos are Display P3; the canvas is set to P3 where supported, and a custom JPEG writer embeds the P3 profile while dropping location data (verified in Phase 1), so colours don't shift. HDR is out of scope.
Layer
 | Choice
 | Source the workspace can reach
 | Cost
 | 
Language and UI
 | TypeScript, React, Vite
 | npm
 | Free
 | 
Face landmarks and iris
 | BlazeFace detector for the face picker, then MediaPipe-derived face mesh and iris models in TensorFlow.js format, from @vladmandic/human-models (MIT)
 | npm
 | Free
 | 
Segmentation and hair
 | Selfie and Meet person-segmentation models from the same MIT package (person vs background only), run on a crop around each picked face; hair edges refined with a guided filter written from scratch
 | npm
 | Free
 | 
Rendering
 | WebGL2 shaders; TensorFlow.js on its WebGL backend, so no threaded WebAssembly and no special server headers are needed
 | npm
 | Free
 | 
Heal
 | Deterministic patch search in a Web Worker (CPU)
 | Written from scratch
 | Free
 | 
Object erase
 | Classical patch-based inpainting (PatchMatch-style) in a Web Worker, no model download
 | Written from scratch
 | Free
 | 
Image input
 | HEIC decoder (libheif WASM, LGPL) loaded only on desktop Chrome, Edge and Firefox; iOS Safari converts or decodes HEIC itself
 | npm
 | Free
 | 
State
 | Zustand store holding the edit history
 | npm
 | Free
 | 
Testing
 | Vitest + Playwright core driving Chromium from @sparticuz/chromium, with mobile emulation and pixel tolerances
 | npm
 | Free
 | 
Hosting
 | GitHub Pages on a public repo (free Pages requires one), deployed by a GitHub Action on every push; all models served from the same site
 | GitHub
 | Free
 | 
Why these sources: the build workspace can reach npm and GitHub but not Hugging Face, Google's model storage, image sites or browser download servers. Every dependency above comes from npm or is written from scratch, so the build needs no files from anyone.
GitHub Pages wins because it needs only the repo; Vercel and Cloudflare Pages both need a manual account link, and Claude artifacts cap files at 16 MB.
Skills and tooling
Phase 0 installs 20 of 24 reviewed agent skills from 8 GitHub repos, each pinned to the commit scanned on 2026-10-11. All 24 passed a security review; the 4 that no longer fit the current stack are not installed.
Skill
 | Repo @ commit
 | Used in
 | Scan score · verdict
 | Note
 | 
brainstorming
 | obra/superpowers @ bb92a77
 | 0
 | 75 · Do not install
 | False positive (local preview server). Spec only; skip its preview page, which loads a third-party logo
 | 
writing-plans
 | obra/superpowers @ bb92a77
 | 0
 | 0 · Caution
 | Clean
 | 
executing-plans
 | obra/superpowers @ bb92a77
 | 1–6
 | 17 · Caution
 | False positive (warns about git clean -fdx)
 | 
test-driven-development
 | obra/superpowers @ bb92a77
 | 1–6
 | 0 · Caution
 | Clean
 | 
systematic-debugging
 | obra/superpowers @ bb92a77
 | 1–6
 | 77 · Do not install
 | False positive (Keychain debugging example)
 | 
verification-before-completion
 | obra/superpowers @ bb92a77
 | 1–6
 | 7 · Safe
 | Clean
 | 
using-superpowers
 | obra/superpowers @ bb92a77
 | Not installed
 | 49 · Caution
 | False positive (Codex config docs). Left inactive: forces a skill check before every reply
 | 
frontend-design
 | anthropics/skills @ dbd4588
 | 0–1
 | 13 · Safe
 | False positive ("don't apologize" UX copy advice)
 | 
skill-creator
 | anthropics/skills @ dbd4588
 | 0
 | 100 · Do not install
 | False positive (local subprocess env). Writes the project's custom skills
 | 
webapp-testing
 | anthropics/skills @ dbd4588
 | 1–6
 | 49 · Caution
 | False positive (starts the dev server by design)
 | 
playwright-cli
 | microsoft/playwright-cli @ b85c7a7
 | 1–6
 | 80 · Do not install
 | False positive (advice to delete saved login files)
 | 
web-design-guidelines
 | vercel-labs/agent-skills @ 063bee9
 | 1, 5
 | 0 · Caution
 | Clean
 | 
react-best-practices
 | vercel-labs/agent-skills @ 063bee9
 | 1–5
 | 59 · Do not install
 | False positive (Next.js example). Client-side rules only; server rules don't apply to Vite
 | 
web-shaders
 | owenob1/web-shaders-agent-kit @ f027758
 | 1–3
 | 0 · Caution
 | Clean; one Markdown file linking to docs
 | 
chrome-devtools
 | ChromeDevTools/chrome-devtools-mcp @ f08dbe1
 | 5
 | 7 · Safe
 | Runs against the workspace Chromium
 | 
chrome-devtools-cli
 | ChromeDevTools/chrome-devtools-mcp @ f08dbe1
 | 5
 | 0 · Caution
 | Clean
 | 
debug-optimize-lcp
 | ChromeDevTools/chrome-devtools-mcp @ f08dbe1
 | 5
 | 45 · Caution
 | False positive (plain JavaScript snippets)
 | 
memory-leak-debugging
 | ChromeDevTools/chrome-devtools-mcp @ f08dbe1
 | 1–5
 | 22 · Caution
 | False positive (reads its own server config)
 | 
web-perf
 | cloudflare/skills @ c430dd9
 | 5
 | 0 · Caution
 | Clean
 | 
wrangler
 | cloudflare/skills @ c430dd9
 | Not installed
 | 8 · Caution
 | Clean. Hosting moved to GitHub Pages
 | 
remotion-create
 | remotion-dev/skills @ 32b241b
 | 6
 | 10 · Safe
 | Demo video
 | 
remotion-render
 | remotion-dev/skills @ 32b241b
 | 6
 | 12 · Safe
 | Demo video
 | 
remotion-best-practices
 | remotion-dev/skills @ 32b241b
 | Not installed
 | 76 · Do not install
 | False positive (bundled map guides). Create and render cover the demo
 | 
transformers-js
 | huggingface/skills @ c3ff942
 | Not installed
 | 43 · Caution
 | Clean. Models now come from npm as TensorFlow.js, not Transformers.js
 | 
How they were checked: NVIDIA's SkillSpector static scan (--no-llm, so $0), then every high-severity finding read against its source, plus a sweep for hidden Unicode, encoded blobs and pipe-to-shell installs. No malicious content was found. Six skills scored "Do not install"; the five that are installed have that verdict overridden after manual review found a false positive, as each row notes, and the sixth is not installed. webapp-testing and playwright-cli are pointed at the workspace Chromium, since their own browser downloads are blocked. A score of 0 reads "Caution" because the scanner fails closed when its paid semantic pass is off.
Rules for the build: install only at the pinned commits; rescan and read the findings before taking any update; never let a skill add a third-party request to the app; each phase loads only the skills listed for it; brainstorming and writing-plans run in a no-questions mode, answering from this plan instead of asking a human.
Build phases
Seven phases (0–6) run back to back with no human review between them; each phase gate is checked automatically and by an independent reviewer agent. A run is one scheduled build session of up to 2–3 hours; the total is 19–34 runs, roughly 38–102 hours of machine time, including a 50–100% rework buffer. Runs fire every 4 hours, so at about 6 a day the build should take 1–2 weeks of calendar time, longer if usage limits cut runs short. Actuals are logged because overruns are part of the story.
Phase
 | Delivers
 | Done when
 | Est. runs
 | 
0 · Spec and setup
 | Feature spec, UI flow, design tokens, a rubric per tool, open-licence test-photo grid sourced by Claude, agent skills installed at pinned commits and confirmed to run on the workspace Chromium (including the demo-video tool), headless WebGL2 shader proof (WebGL2 with float render targets confirmed on 2026-10-11), GitHub repo and Pages deploy (sources already confirmed: npm and GitHub only)
 | Every tool has inputs, ranges, its own definition of "outside the mask", and objective checks with thresholds frozen here (later changes logged); a test push deploys to the live link; the photo grid meets minimum coverage, or the build stops and notifies Dii
 | 1–2
 | 
1 · Skeleton
 | Upload (incl. HEIC), crop & rotate, canvas, zoom/pan, face picker, landmarks, edit history with undo/redo, colour-managed tiled export
 | A 12MP photo (the iPhone 13 Pro Max's size) and a 48MP stress photo load and export at full res in Chromium with iPhone 13 Pro Max emulation and enforced texture limits, colours unchanged
 | 3–6
 | 
2 · Core retouch
 | Smooth, Heal, Whiten, Eyes, Light & colour, before/after
 | Every tool passes its objective checks on every skin-tone group; the reviewer agent rules only on metrics within 10% of their threshold
 | 5–9
 | 
3 · Reshape
 | Face sculpt sliders, Liquify brush, Makeup, Filters
 | Objective checks pass on every skin-tone group, including straight lines staying straight at 50% strength
 | 4–6
 | 
4 · AI tools (v1.1 if it slips)
 | Background remove/blur/replace with guided-filter hair edges, Object erase
 | Objective checks pass on every skin-tone group, including hair and glasses edges; models load once with progress, then come from cache
 | 4–7
 | 
5 · Polish
 | Onboarding, offline caching with persistent-storage request, final performance pass
 | Every shader pass stays within its time and memory budget at a fixed 2048px preview; real frame rate is checked on the iPhone in the testing kit
 | 1–2
 | 
6 · Handoff
 | Case-study draft, build log, 60–90s demo video, and a testing kit: iPhone checklist (first item: export a 12MP photo on the real phone), Firefox and desktop Safari checks, Facetune benchmark steps and rater form
 | Live link works, all automated checks pass, and Dii is notified that it's ready for testing
 | 1–2
 | 
Autonomous execution
After approval, a recurring scheduled task drives the build; each run picks up where the last one stopped, so no one needs to be present.
Read state. Each run opens the repo's progress file: current phase, task list, open failures.
Build. Claude takes the next task, writes the code and its tests.
Verify. The full automated suite runs: unit tests, the test-photo set, preview-vs-export, and Chromium runs with iPhone emulation.
Review. At each phase gate, objective checks decide pass or fail; a separate reviewer agent rules only when a metric lands within 10% of its threshold. A fail sends specific fixes back to step 2.
Commit. Passing work is pushed to GitHub, which deploys to GitHub Pages; the progress file and build log are updated.
Repeat or finish. The next run continues, and Dii gets a short FYI notification at the end of each phase, with no reply needed. After Phase 6, the scheduled task stops itself and notifies Dii.
When stuck: a task that fails its gate three times is cut to its simplest working version or deferred to v1.1, and logged. A tool that fails any skin-tone group counts as failing and doesn't ship in v1. Minimum v1 is the face picker, crop & rotate, Light & colour, before/after, Smooth and Heal; if Smooth or Heal drops out, the build still finishes, but the handoff states plainly that v1 is below minimum. Nothing waits for a human answer, with two exceptions that stop the build and notify Dii: a photo grid below minimum coverage in Phase 0, and the safety limits below.
Safety limits: at most 50 runs in total; the build stops after three runs in a row with no progress, where progress means at least one passing commit; a lock file stops a new run from starting while another is still working, and expires after 4 hours so a crashed run can't jam the build; and work is committed in small steps, so a run cut off by usage limits loses little.
What only a human can do, so it moves to after handoff: testing on the real iPhone and running Facetune for the benchmark (it needs the phone app and a card for the trial).
How each feature works
Most tools are GPU shader passes driven by a mask; Heal and Object erase run in a Web Worker. Face landmarks and segmentation decide where each mask goes.
Tool
 | Technique
 | Mask source
 | 
Smooth
 | Suppress the mid-frequency band (where blemishes and uneven texture sit) with an edge-aware guided or bilateral filter; keep the finest detail so pores survive; radii scale with face size
 | Face-mesh outline minus eye, brow, lip and nostril polygons, narrowed by a skin-colour model sampled from that face's own cheeks, never a fixed skin range, to avoid tone bias (the segmenters only separate person from background)
 | 
Heal
 | Deterministic patch search and seamless-clone blend from surrounding skin, on the CPU in a Web Worker
 | User tap + brush radius
 | 
Whiten
 | Lower saturation and lift lightness of yellow tones only
 | Inner-lip polygon from landmarks, thresholded to bright pixels
 | 
Eyes
 | Local contrast + clarity, slight brightness lift on the iris
 | Iris landmarks (eye polygons)
 | 
Light & colour
 | Standard tone curves and white balance in linear colour space, P3-aware
 | Whole image
 | 
Reshape
 | Mesh warp: move landmark-anchored control points, interpolate with thin-plate splines, tight falloff radius
 | Face mesh; nearby background moves too, kept small by the falloff
 | 
Liquify
 | Displacement map painted by brush, applied in a shader
 | Brush strokes
 | 
Makeup
 | Colour blend in multiply/soft-light modes, feathered
 | Lip, cheek and brow polygons
 | 
Filters
 | 3D colour lookup tables (LUTs) with strength mix
 | Whole image
 | 
Background
 | Person mask from the segmenter, refined at hair edges by a guided filter, then blur, fill or swap; composited last
 | Segmenter + guided filter
 | 
Object erase
 | Classical patch-based inpainting in a Web Worker, run on a crop around the brush; result cached. Weaker than an AI model on large objects, which the benchmark will show honestly
 | User brush
 | 
Natural-looking results come from three rules: never touch pixels outside the mask, feather every mask edge, and cap default strength at about 40% so the first impression is subtle.
Testing and the Facetune benchmark
Quality is checked continuously against a fixed photo set, and against Facetune exactly once, at the end.
Test-photo set (Phase 0)
Target: 30 photos laid out as a grid, so gaps are visible: five skin-tone groups (the 10-point Monk Skin Tone scale, built for visual labelling, paired into 5) × three lighting conditions (daylight, indoor, low light) × two variants (front and angled), with glasses, facial hair and three group shots, plus one 48MP photo
Sourced by Claude in Phase 0 from openly licensed (CC0 or CC BY) photo collections hosted on GitHub, the only image source the workspace can reach. Each photo's licence and author are recorded. A CC licence doesn't grant publicity rights, so public showcase images use only photos whose source states a model release; the rest are for testing only
Minimum coverage: at least 24 photos, with 3 or more in every skin-tone group. Below that, Phase 0 stops and notifies Dii rather than building on a thin set. Smaller gaps are logged in the build log and testing kit. Skin-type labels are approximate visual estimates and recorded as such
The same set is used at every phase, so improvements and regressions are visible
During the build
Rubrics (written in Phase 0): one per tool, 3–4 criteria each scored 1–5 (Smooth: plastic look, detail loss, halos; Whiten: unnatural white, lip bleed). A tool passes at an average of 4 or better
Automated checks: each tool runs on the full set; outputs are compared with the previous version, with pixel tolerances because headless browsers render on a software GPU; preview is checked against a downscaled export
Gates and review: objective checks gate every tool: no change beyond each tool's own definition of outside the mask (feathered edges, warps and whole-image tools defined separately), a halo metric at mask edges, fine-detail retention on skin, and a straight-line test for warps. A separate reviewer agent (the same model with fresh context, so not truly independent) rules only on metrics within 10% of their threshold. Thresholds are frozen in Phase 0, and any change is logged
Mobile proxy: every phase runs in Chromium emulating the iPhone 13 Pro Max (screen, touch, CPU throttling), with the app's own 4096px texture and memory limits enforced. Safari's engine can't be downloaded into the workspace, so real Safari testing is in the testing kit
Benchmark (after handoff, run by Dii from the testing kit, $0)
Check which tools Facetune's free tier actually includes. Most are paywalled, and the 7-day trial needs a card, so cancel it before it bills.
Run 8–10 photos through matching tools in both apps, matching the visual result rather than slider numbers, and record every setting used.
Score each pair on the rubrics, then run a blind A/B on a free form with 15–30 raters and randomised left/right order. With this many raters, win rates carry intervals of roughly ±20 points, so results are indicative, not definitive.
Publish raw counts and win rates with confidence intervals per tool, note how many raters are friends, and say where Facetune still wins.
Portfolio documentation
The process is the portfolio, so it is recorded from day one, not reconstructed at the end.
Captured during the build
A build log per phase: what was asked, what Claude produced, what broke, how it was fixed
Key prompts and decisions, including dead ends
Before/after images and screenshots at each phase
Running totals: runs used, human time spent (including planning), infrastructure spend ($0) and the Claude subscription cost
Final deliverables
Live app at a public link
Case study page: the thesis, the build timeline, the benchmark results, and what AI did well and badly
Code repository with a README explaining the pipeline and how to run it
60–90s demo video for social and Dii's site
Headline claim to prove: "A Facetune-class editor, built from scratch by AI, with $0 in infrastructure and licences, in N runs — and here's how close it gets."
Risks, guardrails and next steps
Risk
 | Mitigation
 | 
A dependency becomes unreachable mid-build
 | Sources confirmed before the build (npm and GitHub only); anything that disappears gets an open-licence substitute, logged
 | 
Smoothing looks blotchy or plastic
 | Mid-frequency, edge-aware filter with a detail floor; subtle defaults; rubric across all skin tones
 | 
Reshape bends nearby background
 | Tight falloff radius; test photos with door frames and tiles; check straight lines stay straight
 | 
Phone memory and texture limits
 | Tiled export, downscaled preview, iPhone emulation every phase; real-device check after handoff
 | 
Preview and export look different
 | Face-relative filter radii, deterministic Heal, automated preview-vs-export check
 | 
Colours shift on export
 | P3-aware canvas and colour profile kept on export
 | 
Large in-browser models
 | Loaded on demand with progress, cached after first use; no file over GitHub's 100 MB limit
 | 
Safari clears cached models after about 7 days unused
 | Request persistent storage; suggest adding to the Home Screen
 | 
Low-resolution segmentation
 | Run on face crops; guided-filter refinement at hair edges
 | 
Bias in masks or self-grading
 | Diverse test grid; frozen objective thresholds at every gate; a tool failing any skin-tone group doesn't ship in v1
 | 
Run estimates slip
 | Rework buffer built in; Tier 3 can move to v1.1; actuals reported in the case study
 | 
Legal guardrails
Own name, logo, icons, colours and copy; never Facetune's branding or screenshots in the product
No decompiled or copied Facetune code or assets; behaviour inspires features, the implementation is original
Every model and library licence checked and recorded: some background-removal models (BRIA RMBG, for one) are non-commercial only; test photos must be CC0 or CC BY; Robust Video Matting is GPL-3.0 despite shipping in an MIT package, so it is not used; libheif is LGPL
Repo licence: MIT by default, since every chosen model and library allows it (libheif stays a separate LGPL module); confirmed by Dii
Benchmark images use only photos you have rights to; describe Facetune factually in the case study
Optional "edited" note in exported metadata, as good practice only: Norway's and France's retouching laws require a visible label from whoever publishes the image, which metadata doesn't satisfy
Next steps
Before approval (about 2 minutes, no files)
Pick a reference phone: iPhone 13 Pro Max
Confirm every dependency is reachable from the build workspace (npm and GitHub)
Give Claude access to a GitHub repo for the project (a new empty one, or let Claude create it through your connected GitHub). It must be public for free GitHub Pages; enable Pages on it if Claude can't. Licence: MIT, confirmed
Approve this plan
Then, autonomously
Claude creates the recurring scheduled task. If its runs are set to ask before acting, Dii switches it to automatic approval once, or runs will pause; then Claude builds Phases 0–6
Claude notifies Dii with the live link and testing kit
After handoff
Dii tests on the iPhone and runs the Facetune benchmark
