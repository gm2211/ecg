# ECG Studio

ECG Studio is a static, browser-based educational simulator for cardiac conduction and ECG lead projections. Start it locally with `./run`, then open the URL printed by the launcher.

The Simulation page keeps the heart, ECG, conduction controls, playback, and a compact explanation in one viewport. Adjust the sliders above playback and watch the ECG and timing measurements update. On narrow screens, use the parameter selector to choose a slider; the question-mark button opens control guidance in place. Use the explanation arrows to switch between the current electrical phase, the selected mechanism, and its ECG effect. The phase selector jumps to an electrical event.

**Together** keeps the heart and selected ECG lead visible on compact screens; **Heart** and **ECG** expand either panel. The trace uses square 25 mm/s, 10 mm/mV calibration: 40 ms per small square and 200 ms per large square. Additional beat repeats provide context as the panel widens. The highlighted beat and cursor share the heart's clock. **Compare 3** adds V1 and V6 on larger views. Playback defaults to 0.1×; 0.05× is available without changing the paper calibration.

In **Anatomy**, **See inside** reveals schematic His–Purkinje paths inside the translucent atlas heart. The branches descend toward the apex and fan upward along the ventricular walls. Bundle-branch blocks suppress fast antegrade conduction in the affected bundle; the tissue field shows slower propagated myocardial activation rather than a separate spontaneous beat or a cross-heart cable. The precise sequence varies with block site; these examples are simplified.

## Checks

Run the six dependency-free Node checks from the project root:

```sh
node scripts/check-simulation.cjs
node scripts/check-waveform-variation.cjs
node scripts/check-simulator-quiz.cjs
node scripts/check-heart-anatomy.cjs
node scripts/check-conduction-anatomy.cjs
node scripts/check-ecg-paper.cjs
```

## Simulator quiz

Open **Quiz → Start quiz** for six cases in shuffled order. Inspect the anatomical heart, electrical model, conduction map, and synchronized ECG. Playback and scrubbing remain available while scenario labels and teaching hints are hidden.

Use **Choose answer** in the top bar, select a mechanism, and check your answer. Each case is scored once; **Why this answer?** returns to the simulation with its inline mechanism explanation. Explanations stay hidden until an answer is checked; conduction adjustments stay hidden throughout the quiz. **Back to study** restores your previous scenario, parameters, selected slider, playback, view, and explanation page. Scores last for the current round; they are not uploaded or saved across reloads.

## Educational scope and assets

The anatomical heart, chambers, valves and vessels use the Human Reference Atlas in the same coordinate frame as the torso. The electrical model, electrode landmarks, tissue timing, and lead projections remain simplified illustrations. They are not a clinically validated ECG solver, diagnostic tool, patient-specific simulation, or substitute for clinical training. Read the in-app assumptions and source links for model details.

The anatomical model replaces the earlier unsegmented sculpt. Electrical coloring follows named chamber meshes; great vessels and valves remain uncolored. See Sources → Anatomy in the simulator for textbook and video references.

The heart and torso asset credits, source hashes, reproduction commands, and license details are in [`assets/ATTRIBUTION.md`](assets/ATTRIBUTION.md). Three.js and its included loaders are MIT licensed; see [`lib/THREE-LICENSE.txt`](lib/THREE-LICENSE.txt).

## GitHub Pages

Run the checks above, then `node scripts/build-pages.cjs` to refresh the committed `docs/` site. Commit source changes together with the generated files. GitHub Pages publishes `main` → `/docs` after the PR merges.

The build copies an explicit 17-file allowlist and a `.nojekyll` marker. Local screenshots, backups, tests, and development metadata are excluded from the published site. Branch-based publishing works with the existing GitHub login without requesting additional workflow permissions.
