# Rubrics

Each tool is scored 1-5 on 3-4 criteria by a reviewer agent (same model, fresh context, shown before/after crops at 100% and the full image) on every photo in the test set that applies. **A tool passes at an average of 4.0 or better, and also needs the objective checks in `spec/thresholds.json` to pass on every skin-tone group.** Scores are logged per tool, per skin-tone group, per phase.

Score anchors: 5 = an expert retoucher would ship it; 4 = good, small flaws only visible zoomed; 3 = noticeable flaw; 2 = obvious flaw; 1 = unusable.

| Tool | Criteria |
|------|----------|
| Face picker | Every real face outlined; no false outlines on non-faces; outline sits on the face (not off by more than ~10% fw); selection feedback obvious |
| Crop & rotate | Straighten angle respected; no black/blank corners; edges sharp after rotation; aspect presets correct |
| Smooth | Plastic look (1 = wax) ; detail loss (pores, stubble, brows preserved); halos / smearing at edges of eyes, lips, hairline, glasses; skin-tone colour kept |
| Heal | Blemish gone and invisible; texture continuity with surroundings; no smudge or repeated-pattern artefacts; works near edges (lip, nostril, hairline) |
| Whiten | Unnatural white (1 = paper-white teeth); lip/gum bleed; teeth keep shading and gaps; yellow removed evenly |
| Eyes | Natural look (not glowing/cartoon); sclera stays natural; iris detail improved; lashes/lids untouched |
| Light & colour | Skin tones stay believable; no banding or clipping at extremes; controls behave predictably; neutral look at 0 |
| Before/after | Compare is instant, aligned pixel for pixel, no flicker |
| Reshape | Looks like the same person; straight lines stay straight; no stretching of neighbouring background/hair; symmetry sensible |
| Liquify | Smooth displacement; no tearing; strength predictable; reconstruct restores cleanly |
| Makeup | Colour sits on the feature (lip edge, cheek, brow shape); texture shows through; hue believable on this skin tone |
| Filters | Look matches its name; skin stays natural at default; strength slider smooth; no banding |
| Background | Clean edge around hair and glasses; no halo of old background; blur looks optical; replace blends with subject lighting |
| Object erase | Fill plausible; texture and structure continue; no repeats or ghosts; edges invisible |

Not rubric-scored: export fidelity (objective only), performance (budgets only).
