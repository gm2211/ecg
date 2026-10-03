// Behavioral acceptance checks for the shared electrophysiology model.
// These verify educational mechanisms, not clinical ECG validation.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sim = require('../simulation-model.js');
const near = (a, b, tolerance = 1e-10) => assert(Math.abs(a - b) <= tolerance, `${a} ≠ ${b}`);
const models = Object.fromEntries(sim.scenarios.map(s => [s.id, sim.createModel({ scenario: s.id })]));
const region = (model, id) => model.regions.find(r => r.id === id);
const maxAbs = (model, lead, from, to) => {
  let maximum = 0;
  for (let t = from; t < to; t += 1) maximum = Math.max(maximum, Math.abs(model.sample(lead, t)));
  return maximum;
};

// Both supported loading modes expose the same public API.
const browser = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../simulation-model.js'), 'utf8'), browser);
assert.equal(browser.EPSimModel.scenarios.length, 6);
assert.equal(browser.EPSimModel.createModel({ scenario: 'normal' }).qrsMs, 90);

// Fixed absolute conduction times do not scale when heart rate changes.
const normal = models.normal;
assert.equal(normal.prMs, 160);
assert.equal(normal.qrsMs, 90);
assert.equal(sim.createModel({ scenario: 'normal', bpm: 120 }).prMs, normal.prMs);
assert.equal(sim.createModel({ scenario: 'normal', bpm: 50 }).qrsMs, normal.qrsMs);
const fastReference = sim.createModel({ scenario: 'normal', bpm: 180 });
near(fastReference.cycleMs, models.avrt.cycleMs);
assert.equal(fastReference.params.bpm, 180);
assert.equal(fastReference.prMs, normal.prMs);
for (let t = 0; t < fastReference.cycleMs; t += 3) {
  for (const lead of sim.leads) near(fastReference.sample(lead, t), fastReference.sample(lead, t + fastReference.cycleMs), 1e-9);
}
assert.equal(normal.phase(normal.qrsEnd + 20).id, 'st', 'ST interval describes depolarized ventricular tissue');
assert(normal.sample('V1', normal.qrsStart + 10) > 0.1, 'Normal septal r in V1');
assert(normal.sample('V1', normal.qrsStart + 43) < -0.5, 'Normal dominant S in V1');
assert(normal.sample('V6', normal.qrsStart + 10) < 0, 'Normal lateral septal q');
assert(normal.sample('V6', normal.qrsStart + 43) > 0.8, 'Normal dominant lateral R');

// RBBB preserves left ventricular/septal timing, adding only delayed RV spread.
const rbbb = models.rbbb;
for (const id of ['septum', 'lv', 'lv-base']) {
  assert.equal(region(rbbb, id).onset, region(normal, id).onset);
  assert.equal(region(rbbb, id).end, region(normal, id).end);
}
assert(region(rbbb, 'rv').onset > region(normal, 'rv').onset);
assert(region(rbbb, 'rv').end > normal.qrsEnd);
assert.equal(rbbb.qrsMs, 150);
const terminal = rbbb.qrsEnd - 40;
assert(rbbb.sample('V1', terminal) > 0.8, 'RBBB terminal R′ in V1');
assert(rbbb.sample('V6', terminal) < -0.5, 'RBBB terminal S in V6');
assert(rbbb.sample('I', terminal) < -0.5, 'RBBB terminal S in I');
assert(rbbb.paths.find(p => p.id === 'right-bundle').blocked);
assert(!rbbb.paths.find(p => p.id === 'left-bundle').blocked);
assert(rbbb.activation('RV', -1, 0, 0).onset > rbbb.activation('RV', 1, 0, 0).onset, 'RBBB spreads septal→lateral');

// LBBB reverses septal direction, delays LV and retains broad lateral positivity.
const lbbb = models.lbbb;
assert(region(lbbb, 'septum').vector[0] > 0 && region(normal, 'septum').vector[0] < 0);
assert(region(lbbb, 'lv').end > region(normal, 'lv').end);
assert(lbbb.sample('V6', lbbb.qrsStart + 10) > 0, 'No initial lateral septal q');
assert(lbbb.sample('V1', lbbb.qrsStart + 65) < -0.7);
assert(lbbb.sample('V6', lbbb.qrsStart + 65) > 0.7);
assert(lbbb.activation('LV', 1, 0, 0).onset > lbbb.activation('LV', -1, 0, 0).onset, 'LBBB spreads septal→lateral');

// WPW is a race between two routes: a local breakthrough before His/Purkinje,
// then fusion. The initial delta is not synthesized independently of that event.
const wpw = models.wpw;
assert(wpw.prMs < 120);
assert(wpw.qrsMs > 120);
assert(region(wpw, 'preexcitation').onset < region(wpw, 'septum').onset);
assert.equal(wpw.paths.find(p => p.id === 'accessory').end, region(wpw, 'preexcitation').onset);
near(wpw.activation('LV', 1, 0.85, 0.1).onset, wpw.prMs);
assert(wpw.sample('V1', wpw.prMs + 15) > 0, 'Left free-wall delta points toward V1 in this model');
assert(wpw.sample('V6', wpw.prMs + 15) < 0, 'Left free-wall delta points away from V6');
assert(maxAbs(wpw, 'V1', wpw.prMs + 2, normal.qrsStart - 10) > 0.1);
const earlyPath = sim.createModel({ scenario: 'wpw', accessory: 65 });
assert(earlyPath.prMs < wpw.prMs && earlyPath.qrsMs > wpw.qrsMs);
assert(earlyPath.activation('LV', 1, 0.85, 0.1).onset < wpw.activation('LV', 1, 0.85, 0.1).onset);

// First-degree AV block moves ventricular events together without dropping P/QRS.
const avblock = models.avblock;
assert(avblock.prMs > 200 && avblock.qrsMs === normal.qrsMs);
for (const id of ['septum', 'lv', 'rv', 'lv-base']) near(region(avblock, id).onset - region(normal, id).onset, 80);
assert.equal(region(avblock, 'ra').onset, region(normal, 'ra').onset);
assert.equal(avblock.paths.filter(p => p.blocked).length, 0);

// Orthodromic AVRT is closed-loop AV/His antegrade and accessory retrograde.
// Cycle zero is the returning atrial impulse, 100 ms after the prior QRS onset.
for (const bpm of [150, 180, 200]) {
  const m = sim.createModel({ scenario: 'avrt', bpm, avDelay: 80 });
  const returnPath = m.paths.find(p => p.id === 'accessory');
  assert(returnPath.accessory && returnPath.retrograde);
  assert(!m.regions.find(r => r.id === 'preexcitation'));
  assert(!m.paths.find(p => p.id === 'sa-atria'));
  assert.equal(m.qrsMs, 90);
  near(m.cycleMs - m.qrsStart, 100);
  near(returnPath.end, m.cycleMs);
  near(m.params.avDelay + 10, m.qrsStart);
  assert(region(m, 'la').vector[1] > 0, 'Retrograde atrial vector is superior');
  assert(returnPath.start > m.qrsStart && returnPath.start < returnPath.end);
}

// Recovery starts after the AVRT cycle boundary but must still contribute to
// the following cycle. Disable only recovery vectors to isolate its actual
// contribution without reimplementing the model's wrapping arithmetic.
const avrtRecovery = sim.createModel({ scenario: 'avrt', bpm: 180 });
assert(avrtRecovery.recoveryStart > avrtRecovery.cycleMs);
const recoveryProbe = 60;
const withRecovery = avrtRecovery.vector(recoveryProbe);
for (const r of avrtRecovery.regions) r.recoveryVector = [0, 0, 0];
const withoutRecovery = avrtRecovery.vector(recoveryProbe);
assert(Math.hypot(...withRecovery.map((v, i) => v - withoutRecovery[i])) > 0.04, 'AVRT recovery crosses the cycle boundary into the next trace');

// Trace generation is literally the projection of the shared regional vector;
// limb lead algebra remains exact throughout every scenario and control extreme.
let samples = 0;
for (const scenario of sim.scenarios) {
  for (const bpm of [50, 75, 120, 150, 200]) {
    for (const control of [50, 110, 190, 240]) {
      const m = sim.createModel({ scenario: scenario.id, bpm, avDelay: control, branchDelay: control, accessory: control });
      assert(m.qrsStart >= 0 && m.qrsEnd < m.cycleMs, `${scenario.id}: complete QRS fits cycle`);
      for (let t = 0; t < m.cycleMs; t += 7) {
        const vector = m.vector(t);
        assert(vector.every(Number.isFinite));
        for (const lead of sim.leads) {
          const value = m.sample(lead, t);
          assert(Number.isFinite(value) && Math.abs(value) < 3, `${scenario.id}/${lead}: bounded finite signal`);
          near(value, vector.reduce((sum, v, i) => sum + v * sim.leadAxes[lead][i], 0));
          near(value, m.sample(lead, t + m.cycleMs), 1e-9);
          samples++;
        }
        const I = m.sample('I', t), II = m.sample('II', t);
        near(m.sample('III', t), II - I);
        near(m.sample('aVR', t), -(I + II) / 2);
        near(m.sample('aVL', t), I - II / 2);
        near(m.sample('aVF', t), II - I / 2);
        assert(m.phase(t).label.length > 0);
      }
      for (const chamber of ['RA', 'LA', 'RV', 'LV', 'septum']) {
        for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
          const cell = m.activation(chamber, x, y, z);
          assert(Number.isFinite(cell.onset) && Number.isFinite(cell.recovery));
          assert(cell.recovery > cell.onset, `${scenario.id}/${chamber}: recovery follows activation`);
          const sameChamber = m.regions.filter(r => r.chamber === chamber);
          assert(cell.recovery >= Math.min(...sameChamber.map(r => r.recoveryStart)), 'Tissue recovery does not precede its regional trace contribution');
          assert(cell.recoveryEnd <= Math.max(...sameChamber.map(r => r.recoveryEnd)) + 1e-9, 'Tissue recovery finishes within its regional trace contribution');
          near(cell.recoveryEnd - cell.recovery, cell.recoveryDuration);
          if (chamber !== 'RA' && chamber !== 'LA') assert(cell.onset >= m.qrsStart && cell.onset <= m.qrsEnd, 'Ventricular animation stays within shared QRS schedule');
        }
      }
    }
  }
}
assert(sim.createModel({ scenario: 'invalid' }).scenario.id === 'normal');
assert(sim.createModel({ bpm: NaN, avDelay: Infinity }).vector(NaN).every(Number.isFinite));
console.log(`PASS: 6 mechanisms; activation ordering, BBB lead polarity, WPW fusion, AVRT loop, AV delay, ${samples.toLocaleString()} finite lead samples, exact limb-lead algebra, periodicity, and tissue/trace timing.`);
