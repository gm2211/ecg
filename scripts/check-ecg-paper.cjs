const assert = require('node:assert/strict');
const { layout } = require('../ecg-paper.js');

function close(actual, expected, tolerance = 1e-9) {
  assert(Number.isFinite(actual), `expected finite value, got ${actual}`);
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

const viewports = [
  { width: 1440, height: 360, name: 'desktop wide' },
  { width: 390, height: 520, name: 'mobile tall' },
  { width: 320, height: 220, name: 'short mobile' },
];
const rates = [50, 75, 100, 150, 180, 200];
const amplitudes = [-1.8, 1.6];

for (const viewport of viewports) {
  for (const bpm of rates) {
    const cycleMs = 60000 / bpm;
    const paper = layout({ ...viewport, cycleMs, minValue: amplitudes[0], maxValue: amplitudes[1] });
    assert(paper.durationMs >= cycleMs, `${viewport.name} at ${bpm} bpm must fit a full cycle`);
    assert.equal(paper.durationMs % 40, 0, 'visible duration aligns to small-square time boundaries');
    close(paper.pxPerMs * 40, paper.smallPx);
    close(paper.pxPerMv * 0.1, paper.smallPx);
    close(paper.largePx, paper.smallPx * 5);
    close(paper.toX(40) - paper.toX(0), paper.smallPx);
    close(paper.toY(0) - paper.toY(0.1), paper.smallPx);
    close(paper.timeAtX(paper.toX(cycleMs * 0.73)), cycleMs * 0.73, 1e-7);
    close(paper.valueAtY(paper.toY(-0.37)), -0.37, 1e-9);
    assert(paper.toY(amplitudes[1]) >= paper.top - 1e-8, 'maximum sample fits in plot');
    assert(paper.toY(amplitudes[0]) <= paper.bottomEdge + 1e-8, 'minimum sample fits in plot');
  }
}

const wide = layout({ width: 1920, height: 600, cycleMs: 800, minValue: -1, maxValue: 1 });
assert(wide.durationMs >= wide.cycleMs * 2, 'wide plots show multiple beats at the calibrated scale');
assert.equal(wide.left, 12);
assert.equal(wide.right, 12);
assert.equal(wide.top, 26);
assert.equal(wide.bottom, 18);

const slowPlayback = layout({ width: 900, height: 300, cycleMs: 600, minValue: -1, maxValue: 1, playbackRate: 0.25 });
const fastPlayback = layout({ width: 900, height: 300, cycleMs: 600, minValue: -1, maxValue: 1, playbackRate: 3 });
assert.equal(slowPlayback.smallPx, fastPlayback.smallPx, 'playback rate cannot change paper calibration');
assert.equal(slowPlayback.durationMs, fastPlayback.durationMs);

for (const dims of [{ width: 0, height: 0 }, { width: 1, height: 1 }, { width: 8, height: 12 }]) {
  const paper = layout({ ...dims, cycleMs: 333.333, minValue: -Infinity, maxValue: NaN });
  for (const value of Object.values(paper)) {
    if (typeof value === 'number') assert(Number.isFinite(value), `tiny viewport produced ${value}`);
  }
  close(paper.toX(0), paper.left);
  close(paper.toY(0), paper.zeroY);
  close(paper.timeAtX(paper.left), 0);
}

console.log('PASS: standard square calibration, full-cycle fit, repeated beats, inverse mappings, fixed playback calibration, and finite tiny-viewport geometry.');
