# Testing kit

Live app: https://diizwe.github.io/dii-faceeditor/ . Demo video: `docs/demo/dii-faceeditor-demo.mp4`. Known gaps: `docs/KNOWN_GAPS.md`.
Everything automated already ran in Chromium (iPhone 13 Pro Max emulation, software WebGL2). The items below need a real device.

## A. iPhone (Safari) checklist
Do these in order and write down pass / fail and anything odd.
1. **Export a 12 MP photo.** Open a photo straight from your camera roll (a normal 12 MP iPhone photo), make any edit, tap Export, choose JPEG 92. Does it finish? Time it. Does the saved photo open in Photos at full size (4032 x 3024) with the same colours as the original? If it fails or the page reloads, note the exact step (this is the most important check: iOS limits canvas and memory).
2. Open a HEIC photo (not converted). Does it load?
3. Face picker: a photo with two or more faces. Do the outlines sit on the faces; can you tap each?
4. Smooth, Light & colour, Reshape, Makeup, Filters: do the sliders feel instant (target 60 fps; note any lag, and which tool)?
5. Heal: tap a blemish; drag across a few. Does it finish within a couple of seconds?
6. Two-finger pinch-zoom and pan; one-finger drag with Liquify and Heal does not scroll the page.
7. Undo / redo, hold Compare, Split.
8. Add to Home Screen, turn on airplane mode, open it: the app and previously used models should load offline.
9. Colours: open the same Display P3 photo in Photos and in the exported file side by side; any visible shift?
10. Rotate the phone; light and dark mode.

## B. Other browsers
- **Firefox (desktop and Android):** load, edit with every tool, export JPEG and PNG, offline reload.
- **Safari (macOS):** same as above; also drag a photo onto the start screen.
- **Chrome / Edge** for a baseline.
Record browser and version for each failure. Known risk: very large photos (48 MP+) on phones with little memory.

## C. Facetune benchmark (run once, at the end)
1. Check which tools the free tier of Facetune really includes (most are paywalled). The 7-day trial needs a card: set a reminder to cancel before it bills.
2. Pick 12-15 photos from `testdata/photos/` covering all five skin-tone groups (see `testdata/COVERAGE.md`). Edit each with the matching tool in both apps at a moderate setting, export, and name the files `<photo>_dii.jpg` and `<photo>_facetune.jpg`.
3. Score each pair on the rubric for that tool (`docs/RUBRICS.md`), 1-5, per skin-tone group.
4. Blind A/B: a free form (two images per question, left/right order randomised, "which looks better / more natural?", plus "can't tell"). Aim for 15-30 raters; with that many, win rates have intervals of roughly +-20 points, so they are indicative only.
5. Publish raw counts and win rates with confidence intervals per tool, say how many raters are friends, and say where Facetune still wins.

## D. Rater form (copy into any form tool)
- Intro: "You will see pairs of retouched portraits. Pick the one that looks better and more natural. There are no right answers."
- Per pair: *Which looks better?* A / B / No difference. *Which looks more natural?* A / B / No difference. *(optional)* What gave it away?
- End: age range, how often you edit photos (never / sometimes / often), are you a friend or colleague of the builder (yes / no).

## E. What to send back
For each failed item: device, iOS / browser version, the photo size, what happened, a screenshot if possible.
