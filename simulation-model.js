/*
 * ECG Studio: a reduced-order educational electrophysiology model.
 * Both the tissue display and the trace use the activation schedule below.
 * Regional dipoles and approximate lead axes are illustrative, not a validated
 * bidomain/torso-volume-conductor solver. Amplitudes use a normalized mV scale.
 * Coordinates: +x patient left, +y superior, +z anterior.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EPSimModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const wrap = (v, period) => ((v % period) + period) % period;
  const scenarios = [
    { id: 'normal', label: 'Normal conduction', short: 'Sinus',
      summary: 'Follow a sinus impulse through the AV node and both bundle branches.',
      mechanism: 'Atrial activation is followed by AV delay. The septum activates left to right; rapid His–Purkinje conduction recruits both ventricles.',
      ecg: 'A P wave, PR interval of 120–200 ms, and narrow QRS. Lead polarity depends on which way the net electrical vector points.',
      defaults: { bpm: 75, avDelay: 150, branchDelay: 60, accessory: 90 } },
    { id: 'rbbb', label: 'Right bundle branch block', short: 'RBBB',
      summary: 'Keep the early sequence intact. Watch the right ventricle finish late.',
      mechanism: 'The left bundle still activates the septum and left ventricle normally. Cell-to-cell spread through septal and ventricular myocardium recruits the right ventricular free wall late. The delayed tissue is responding to conducted excitation, not generating a separate beat.',
      ecg: 'The terminal rightward/anterior vector creates R′ in V1 and a terminal S in I and V6. The prolonged sequence widens the QRS.',
      defaults: { bpm: 75, avDelay: 150, branchDelay: 60, accessory: 90 } },
    { id: 'lbbb', label: 'Left bundle branch block', short: 'LBBB',
      summary: 'Reverse septal activation, then recruit the left ventricle slowly.',
      mechanism: 'The right bundle activates first. Septal activation reverses to right to left, and slower cell-to-cell spread recruits the left ventricular free wall. This example shows a proximal block; the exact sequence and distal Purkinje recruitment vary with the site of disease.',
      ecg: 'A broad, predominantly negative QRS in V1 and broad positive QRS in I/V6. The normal small septal q in lateral leads is lost.',
      defaults: { bpm: 75, avDelay: 150, branchDelay: 60, accessory: 90 } },
    { id: 'wpw', label: 'Ventricular pre-excitation', short: 'WPW pattern',
      summary: 'An accessory pathway starts ventricular activation before the AV route arrives.',
      mechanism: 'This example places an antegrade accessory pathway at the left free wall. Slow local myocardial spread starts early, then fuses with rapid His–Purkinje activation.',
      ecg: 'A short PR and slurred initial QRS (delta wave). Delta polarity varies with pathway location; this is one left free-wall example.',
      defaults: { bpm: 75, avDelay: 150, branchDelay: 60, accessory: 90 } },
    { id: 'avblock', label: 'First-degree AV block', short: 'Long PR',
      summary: 'Lengthen conduction to the ventricles while preserving each conducted beat.',
      mechanism: 'This example increases AV conduction delay. Every atrial activation still reaches the His–Purkinje system and both ventricles.',
      ecg: 'PR exceeds 200 ms. QRS remains narrow here because ventricular conduction is preserved; no beats are dropped.',
      defaults: { bpm: 75, avDelay: 230, branchDelay: 60, accessory: 90 } },
    { id: 'avrt', label: 'Orthodromic AVRT', short: 'AVRT',
      summary: 'Trace a repeating circuit down the AV node and back up an accessory pathway.',
      mechanism: 'Antegrade AV/His–Purkinje conduction activates the ventricles normally. The left free-wall accessory pathway carries the impulse retrogradely to the atria. Cycle zero is that returning atrial activation, not a new sinus impulse.',
      ecg: 'A regular narrow-complex tachycardia without antegrade delta waves. The retrograde P follows the preceding QRS; its position depends on circuit timing.',
      defaults: { bpm: 180, avDelay: 223.333333, branchDelay: 60, accessory: 90 } },
  ];
  const leads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const leadAxes = {
    I: [1, 0, 0], II: [0.5, -Math.sqrt(3) / 2, 0], III: [-0.5, -Math.sqrt(3) / 2, 0],
    aVR: [-0.75, Math.sqrt(3) / 4, 0], aVL: [0.75, Math.sqrt(3) / 4, 0], aVF: [0, -Math.sqrt(3) / 2, 0],
    V1: [-0.55, 0, 0.835], V2: [-0.25, 0, 0.968], V3: [0.2, 0, 0.98],
    V4: [0.55, 0, 0.835], V5: [0.83, 0, 0.56], V6: [1, 0, 0.05],
  };
  const landmarks = {
    sa: [-0.69, 0.82, 0.12], av: [-0.07, 0.18, 0.17], his: [0, 0.01, 0.12],
    septum: [0.02, -0.35, 0.08], rv: [-0.48, -0.54, 0.25], lv: [0.45, -0.67, 0.10],
    la: [0.45, 0.62, -0.10], accessoryA: [0.74, 0.38, -0.03], accessoryV: [0.76, 0.03, 0.04],
  };
  const sources = [
    { label: 'Clinical Methods: intraventricular conduction', url: 'https://www.ncbi.nlm.nih.gov/books/NBK354/' },
    { label: 'AHA/ACCF/HRS ECG standardization: conduction disturbances', url: 'https://www.jacc.org/doi/10.1016/j.jacc.2008.12.013' },
    { label: 'Wolff–Parkinson–White and AVRT mechanisms', url: 'https://www.ncbi.nlm.nih.gov/books/NBK554437/' },
    { label: 'University of Minnesota: conduction and gap junctions', url: 'https://www.vhlab.umn.edu/atlas/conduction-system-tutorial/gap-junctions.shtml' },
    { label: 'Human conduction-system microanatomy (Stephenson et al.)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5543124/' },
    { label: 'Human LBBB activation mapping (Wyndham et al.)', url: 'https://www.ahajournals.org/doi/pdf/10.1161/01.cir.61.4.696' },
  ];
  const pulse = (time, start, end) => {
    if (time <= start || time >= end) return 0;
    const s = Math.sin(Math.PI * (time - start) / (end - start));
    return s * s;
  };

  function createModel(input) {
    const options = input || {};
    const scenario = scenarios.find(s => s.id === options.scenario) || scenarios[0];
    const id = scenario.id, d = scenario.defaults;
    const reentry = id === 'avrt', blocked = id === 'rbbb' || id === 'lbbb';
    // The normal comparator may share a tachycardia's rate even though the
    // normal-scenario UI limits its own rate control to 50–120 BPM.
    const bpm = clamp(finite(options.bpm, d.bpm), reentry ? 150 : 50, reentry || id === 'normal' ? 200 : 120);
    const cycleMs = 60000 / bpm;
    // AVRT is a closed timing loop: atrium→His→ventricle→atrium. Rate fixes
    // total loop time; the illustrative ventricular-to-atrial interval is 100 ms.
    const avDelay = reentry ? cycleMs - 110 : clamp(finite(options.avDelay, d.avDelay), id === 'avblock' ? 200 : 110, id === 'avblock' ? 240 : 190);
    const branchDelay = clamp(finite(options.branchDelay, d.branchDelay), 30, 100);
    const normalQRS = avDelay + 10;
    const accessory = clamp(finite(options.accessory, d.accessory), 50, Math.min(115, normalQRS - 25));
    const qrsStart = id === 'wpw' ? accessory : normalQRS;
    const qrsEnd = normalQRS + 90 + (blocked ? branchDelay : 0);
    const qrsMs = qrsEnd - qrsStart;
    const prMs = normalQRS === qrsStart ? normalQRS : accessory;
    const params = { scenario: id, bpm, avDelay, branchDelay, accessory };
    const regions = [];
    function add(id, label, chamber, onset, end, vector) {
      const isAtrium = chamber === 'RA' || chamber === 'LA';
      const duration = end - onset;
      // Recovery is broad and follows regional activation. AVRT recovery may
      // cross the cycle boundary; vector() and activation() handle periodicity.
      const recoveryStart = isAtrium ? end + 105 : qrsEnd + 45 + (onset - qrsStart) * 0.22;
      const recoveryEnd = isAtrium ? end + 185 : recoveryStart + Math.min(145, cycleMs * 0.32);
      const recoveryVector = isAtrium ? vector.map(v => -v * 0.10) : vector.map(v => v * (blocked ? 0.24 : 0.22));
      if (blocked && chamber !== 'septum') {
        // Secondary repolarization discordance is coupled to the changed
        // activation sequence, not a separately selected trace template.
        for (let j = 0; j < 3; j++) recoveryVector[j] *= -1;
      }
      regions.push({ id, label, chamber, onset, end, vector, duration, recoveryStart, recoveryEnd, recoveryVector });
    }
    if (reentry) {
      add('la', 'Retrograde left atrial activation', 'LA', 0, 46, [-0.06, 0.11, -0.03]);
      add('ra', 'Retrograde right atrial activation', 'RA', 16, 70, [-0.045, 0.085, 0.04]);
    } else {
      add('ra', 'Right atrial activation', 'RA', 0, 78, [0.08, -0.12, 0.04]);
      add('la', 'Left atrial activation', 'LA', 22, 100, [0.065, -0.06, -0.03]);
    }
    if (id === 'wpw') {
      add('preexcitation', 'Left free-wall pre-excitation', 'LV', accessory, normalQRS + 24, [-0.34, -0.27, 0.21]);
    }
    const q = normalQRS;
    if (id === 'lbbb') {
      add('septum', 'Reversed septal activation', 'septum', q, q + 26, [0.19, -0.045, -0.095]);
      add('rv', 'Right ventricular activation', 'RV', q + 9, q + 68, [-0.015, -0.07, 0.012]);
      add('lv', 'Delayed left ventricular activation', 'LV', q + 24, q + 66 + branchDelay, [1.12, -0.67, -0.51]);
      add('lv-base', 'Late left ventricular base', 'LV', q + 57 + branchDelay * 0.45, qrsEnd, [0.69, 0.09, -0.26]);
    } else {
      add('septum', 'Left-to-right septal activation', 'septum', q, q + 19, [-0.18, -0.035, 0.11]);
      add('lv', 'Left ventricular activation', 'LV', q + 18, q + 66, [1.16, -0.76, -0.37]);
      add('lv-base', 'Basal ventricular activation', 'LV', q + 56, q + 90, [-0.18, 0.08, -0.14]);
      if (id === 'rbbb') {
        add('rv', 'Delayed right ventricular activation', 'RV', q + 56, qrsEnd, [-0.74, 0.035, 0.87]);
      } else {
        add('rv', 'Right ventricular activation', 'RV', q + 14, q + 62, [-0.17, -0.10, 0.23]);
      }
    }
    const paths = [];
    function path(id, label, points, start, end, extras) {
      paths.push(Object.assign({ id, label, kind: 'specialized-tract', points, start, end }, extras || {}));
    }
    if (!reentry) {
      path('sa-atria', 'SA node to atria', [landmarks.sa, [-0.4, 0.65, 0.12], landmarks.av], 0, 65);
      path('bachmann', 'Interatrial spread', [landmarks.sa, [0, 0.8, 0], landmarks.la], 12, 65);
    } else {
      path('atrial-return', 'Retrograde atrial spread', [landmarks.accessoryA, landmarks.la, [0, 0.54, 0.10], landmarks.av], 0, 70, { retrograde: true });
    }
    path('av-his', 'AV node and His conduction', [landmarks.av, [-0.025, 0.10, 0.14], landmarks.his], 55, avDelay);
    // A small schematic fan represents the distributed subendocardial network,
    // not one serial cable that visits the whole ventricular wall. Chamber-local
    // coordinates are shared with activation() and mapped to atlas chamber bounds
    // by the anatomy renderer. +x remains patient-left within either chamber.
    const fans = [
      [[0.80, -0.60, 0.10], [0.90, 0.20, 0.08], [0.75, 0.62, 0.05]],
      [[0.30, -0.60, 0.50], [0.65, 0.00, 0.68], [0.50, 0.53, 0.70]],
      [[0.25, -0.55, -0.40], [0.65, -0.05, -0.65], [0.45, 0.50, -0.70]],
    ];
    for (const chamber of ['RV', 'LV']) {
      const isRight = chamber === 'RV', side = isRight ? -1 : 1;
      const disabled = id === (isRight ? 'rbbb' : 'lbbb');
      const apex = [-0.30 * side, isRight ? -0.85 : -0.88, isRight ? 0.10 : 0.15];
      const primary = regions.find(r => r.id === chamber.toLowerCase());
      const last = Math.max(...regions.filter(r => r.chamber === chamber && r.id !== 'preexcitation').map(r => r.end));
      // Follow the same normal recruitment interpolation as the myocardial
      // field. WPW's competing accessory wavefront does not make the Purkinje
      // route run backward or start early. Blocked fans have no antegrade pulse.
      const recruitmentTime = ([x, y, z]) => primary.onset +
        (0.70 * (y + 1) / 2 + 0.25 * (side * x + 1) / 2 + 0.05 * (z + 1) / 2) * (last - primary.onset);
      const schematicPoint = ([x, y, z]) => [side * 0.43 + x * 0.29, -0.47 + y * 0.43, 0.10 + z * 0.24];
      const bundleEnd = schematicPoint(apex), arrival = recruitmentTime(apex);
      path(isRight ? 'right-bundle' : 'left-bundle', isRight ? 'Right bundle branch' : 'Left bundle branch',
        [landmarks.his, [side * 0.09, -0.30, 0.12], bundleEnd], avDelay, arrival, { chamber, blocked: disabled });
      fans.forEach((fan, index) => {
        const chamberPoints = [apex, ...fan.map(([x, y, z]) => [side * x, y, z])];
        const pointTimes = chamberPoints.map(recruitmentTime);
        path(`purkinje-${chamber.toLowerCase()}-${index + 1}`, `${chamber} Purkinje network · branch ${index + 1}`,
          chamberPoints.map(schematicPoint), pointTimes[0], pointTimes[pointTimes.length - 1],
          { kind: 'purkinje', chamber, chamberPoints, pointTimes, blocked: disabled, schematic: true });
      });
    }
    if (blocked) {
      const toRight = id === 'rbbb';
      // A distributed tissue field, never a line/bead bouncing between chamber
      // landmarks. Its clock is the same delayed regional activation as the ECG.
      path('myocardial-spread', 'Slow cell-to-cell myocardial spread', [], q + (toRight ? 56 : 24), qrsEnd,
        { kind: 'myocardial-field', chamber: toRight ? 'RV' : 'LV', origin: 'septum', direction: 'septal-to-free-wall' });
    }
    if (id === 'wpw') {
      path('accessory', 'Antegrade left free-wall accessory pathway', [landmarks.la, landmarks.accessoryA, landmarks.accessoryV], 25, accessory, { accessory: true });
    } else if (reentry) {
      path('accessory', 'Retrograde left free-wall accessory pathway', [landmarks.accessoryV, landmarks.accessoryA, landmarks.la], q + 55, cycleMs, { accessory: true, retrograde: true });
    }
    const events = [
      { id: 'atria', label: reentry ? 'Retrograde atrial activation' : 'Atrial activation', time: 0, end: reentry ? 70 : 100, description: reentry ? 'The accessory pathway has returned an impulse from the previous ventricular beat. The inverted atrial vector produces a retrograde P wave.' : 'The SA impulse spreads through both atria. This moving front produces the P wave.' },
      { id: 'av', label: reentry ? 'Antegrade AV conduction' : 'AV delay', time: reentry ? 70 : 100, end: avDelay, description: 'Conduction through the AV node delays ventricular activation. The PR interval includes atrial, AV-node and His conduction.' },
    ];
    if (id === 'wpw') events.push({ id: 'delta', label: 'Early accessory breakthrough', time: accessory, end: normalQRS, description: 'The left free-wall pathway reaches ventricular muscle early. Slow local spread makes a slurred delta wave before normal Purkinje activation joins it.' });
    events.push(
      { id: 'septum', label: id === 'lbbb' ? 'Reversed septal activation' : 'Septal activation', time: q, end: q + (id === 'lbbb' ? 26 : 19), description: id === 'lbbb' ? 'Activation crosses the septum from right to left. The normal lateral septal q disappears.' : 'Initial left-to-right septal activation points toward V1 and away from lateral leads.' },
      { id: 'ventricles', label: id === 'wpw' ? 'Fusion with Purkinje activation' : 'Ventricular activation', time: q + 19, end: blocked ? q + 90 : qrsEnd, description: 'The net vector sums simultaneously active ventricular regions. A lead records the component directed along its axis.' }
    );
    if (blocked) events.push({ id: 'late', label: id === 'rbbb' ? 'Late right ventricle' : 'Late left ventricle', time: q + 90, end: qrsEnd, description: id === 'rbbb' ? 'The right ventricle finishes late. This terminal vector points toward V1 (R′) and away from I/V6 (terminal S).' : 'Slow recruitment of left ventricular muscle prolongs the leftward vector, widening the QRS.' });
    if (reentry) events.push({ id: 'return', label: 'Accessory return to atria', time: q + 55, end: cycleMs, description: 'The accessory pathway carries the impulse upward. It reaches the atria at the next cycle boundary, completing the circuit.' });
    const vRegions = regions.filter(r => r.chamber !== 'RA' && r.chamber !== 'LA');
    const recoveryStart = Math.min(...vRegions.map(r => r.recoveryStart));
    const recoveryEnd = Math.max(...vRegions.map(r => r.recoveryEnd));
    events.push({ id: 'st', label: 'ST interval', time: qrsEnd, end: recoveryStart, description: 'Ventricular tissue is largely depolarized. With little changing activation front, the net electrical vector returns close to baseline before recovery.' });
    events.push({ id: 'recovery', label: 'Ventricular recovery', time: recoveryStart, end: recoveryEnd, description: 'Regional recovery produces the broad T wave. Its simplified vector changes with the activation sequence.' });
    events.sort((a, b) => a.time - b.time);

    function vector(tMs) {
      const t = wrap(finite(tMs, 0), cycleMs), sum = [0, 0, 0];
      for (const r of regions) {
        const activeTime = wrap(t - r.onset, cycleMs) + r.onset;
        const recoveryTime = wrap(t - r.recoveryStart, cycleMs) + r.recoveryStart;
        const depol = pulse(activeTime, r.onset, r.end);
        const recovery = pulse(recoveryTime, r.recoveryStart, r.recoveryEnd);
        for (let j = 0; j < 3; j++) sum[j] += r.vector[j] * depol + r.recoveryVector[j] * recovery;
      }
      return sum;
    }
    function sample(lead, tMs) {
      const axis = leadAxes[lead] || leadAxes.II;
      return vector(tMs).reduce((sum, value, j) => sum + value * axis[j], 0);
    }
    function activation(chamber, xNorm, yNorm, zNorm) {
      const x = clamp(finite(xNorm, 0), -1, 1), y = clamp(finite(yNorm, 0), -1, 1), z = clamp(finite(zNorm, 0), -1, 1);
      const chamberRegions = regions.filter(r => r.chamber === chamber);
      if (!chamberRegions.length) return { onset: Infinity, recovery: Infinity };
      let onset;
      if (chamber === 'RA' || chamber === 'LA') {
        const r = chamberRegions[0];
        const fraction = reentry ? clamp(0.60 * (1 - x) / 2 + 0.40 * (1 - y) / 2, 0, 1) : clamp(0.72 * (1 - y) / 2 + 0.28 * (x + 1) / 2, 0, 1);
        onset = r.onset + fraction * (r.end - r.onset);
      } else if (chamber === 'septum') {
        const r = chamberRegions[0];
        const fraction = id === 'lbbb' ? (x + 1) / 2 : (1 - x) / 2;
        onset = r.onset + fraction * (r.end - r.onset);
      } else {
        const primary = chamberRegions.find(r => r.id === chamber.toLowerCase());
        const last = Math.max(...chamberRegions.filter(r => r.id !== 'preexcitation').map(r => r.end));
        const delayed = (id === 'rbbb' && chamber === 'RV') || (id === 'lbbb' && chamber === 'LV');
        // Normal Purkinje recruitment reaches the apex early, then the base.
        // With a blocked bundle, activation enters at the septal side and
        // traverses the wall to the lateral surface by myocardial conduction.
        const lateral = chamber === 'LV' ? (x + 1) / 2 : (1 - x) / 2;
        const fraction = delayed ? clamp(0.78 * lateral + 0.17 * (y + 1) / 2 + 0.05 * (z + 1) / 2, 0, 1) : clamp(0.70 * (y + 1) / 2 + 0.25 * lateral + 0.05 * (z + 1) / 2, 0, 1);
        onset = primary.onset + fraction * (last - primary.onset);
        if (id === 'wpw' && chamber === 'LV') {
          const distance = Math.sqrt((x - 1) ** 2 + (y - 0.85) ** 2 + (z - 0.1) ** 2);
          onset = Math.min(onset, accessory + distance * 69);
        }
      }
      // Spread visible recovery across the SAME chamber recovery window used
      // by vector(). Reserve each cell's recovery duration inside that window,
      // so its color cannot keep recovering after that chamber's T contribution.
      // The field remains a regional interpolation, not a cellular solver.
      const firstActivation = Math.min(...chamberRegions.map(r => r.onset));
      const lastActivation = Math.max(...chamberRegions.map(r => r.end));
      const firstRecovery = Math.min(...chamberRegions.map(r => r.recoveryStart));
      const lastRecovery = Math.max(...chamberRegions.map(r => r.recoveryEnd));
      const recoveryDuration = Math.min(48, lastRecovery - firstRecovery);
      const recoveryFraction = clamp((onset - firstActivation) / Math.max(1, lastActivation - firstActivation), 0, 1);
      const recovery = firstRecovery + recoveryFraction * (lastRecovery - firstRecovery - recoveryDuration);
      return { onset, recovery, recoveryDuration, recoveryEnd: recovery + recoveryDuration };
    }
    function phase(tMs) {
      const t = wrap(finite(tMs, 0), cycleMs);
      // Mechanism-changing states take precedence over overlapping AV/recovery.
      const priority = ['delta', 'return', 'late', 'septum', 'ventricles', 'atria', 'av', 'recovery', 'st'];
      for (const id of priority) {
        const event = events.find(e => e.id === id);
        if (event && wrap(t - event.time, cycleMs) < event.end - event.time) return { id: event.id, label: event.label, description: event.description };
      }
      return { id: 'rest', label: 'Electrically quiet interval', description: 'No large changing activation or recovery front. The net vector is close to baseline.' };
    }
    return { scenario, params, cycleMs, prMs, qrsMs, qrsStart, qrsEnd, events, regions, paths, sample, vector, activation, phase, landmarks, recoveryStart, recoveryEnd };
  }
  return { scenarios, leads, leadAxes, landmarks, sources, createModel, modelNote: 'Shared regional activation schedule; approximate dipole lead projections on a normalized mV scale. Schematic teaching model, not a validated clinical ECG solver.' };
});
