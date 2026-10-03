# ECG Studio

ECG Studio is a static, browser-based educational simulator for cardiac conduction and ECG lead projections. Start it locally with `./run`, then open the URL printed by the launcher.

## Checks

Run the three dependency-free Node checks from the project root:

```sh
node scripts/check-simulation.cjs
node scripts/check-waveform-variation.cjs
node scripts/check-simulator-quiz.cjs
```

## Simulator quiz

Open **Quiz → Start quiz** for six cases in shuffled order. Inspect the anatomical heart, electrical model, conduction map, and synchronized ECG. Playback and scrubbing remain available while scenario labels and teaching hints are hidden.

Use **Choose answer** in the top bar, select a mechanism, and check your answer. Each case is scored once and includes an explanation. **Back to study** restores your previous scenario, parameters, playback, and view. Scores last for the current round; they are not uploaded or saved across reloads.

## Educational scope and assets

The conduction model, anatomy placement, tissue display, and lead projections are simplified illustrations. They are not a clinically validated ECG solver, diagnostic tool, patient-specific simulation, or substitute for clinical training. Read the in-app assumptions and source links for model details.

The heart and torso asset credits and license details are in [`assets/ATTRIBUTION.md`](assets/ATTRIBUTION.md). Three.js and its included loaders are MIT licensed; see [`lib/THREE-LICENSE.txt`](lib/THREE-LICENSE.txt).

## GitHub Pages

Run the checks above, then `node scripts/build-pages.cjs` to refresh the committed `docs/` site. Commit source changes together with the generated files. GitHub Pages publishes `main` → `/docs` after the PR merges.

The build copies an explicit 14-file allowlist and a `.nojekyll` marker. Local screenshots, backups, tests, and development metadata are excluded from the published site. Branch-based publishing works with the existing GitHub login without requesting additional workflow permissions.
