/* Standard ECG paper geometry for the schematic ECG Studio renderer. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ECGPaper = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SMALL_MS = 40;
  const SMALL_MV = 0.1;
  const LARGE_MS = 200;
  const LARGE_MV = 0.5;
  const finite = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  function layout(options) {
    const input = options || {};
    const width = Math.max(0, finite(input.width, 0));
    const height = Math.max(0, finite(input.height, 0));
    const cycleMs = Math.max(SMALL_MS, finite(input.cycleMs, 800));
    let minValue = finite(input.minValue, -1);
    let maxValue = finite(input.maxValue, 1);
    if (minValue > maxValue) [minValue, maxValue] = [maxValue, minValue];

    // Keep the zero baseline visible even when the sampled extrema are one-sided.
    minValue = Math.min(0, minValue);
    maxValue = Math.max(0, maxValue);
    if (maxValue - minValue < SMALL_MV) {
      minValue = -SMALL_MV / 2;
      maxValue = SMALL_MV / 2;
    }

    // Shrink the label gutters on very small canvases while preserving the
    // requested 12/26/12/18 px gutters at ordinary sizes.
    const left = Math.min(12, width / 4);
    const right = Math.min(12, width / 4);
    const top = Math.min(26, height * 0.30);
    const bottom = Math.min(18, height * 0.25);
    const plotWidth = Math.max(0, width - left - right);
    const plotHeight = Math.max(0, height - top - bottom);
    const smallCellsForCycle = Math.max(1, Math.ceil(cycleMs / SMALL_MS));
    const smallCellsForAmplitude = Math.max(1, Math.ceil((maxValue - minValue) / SMALL_MV));

    // One pixel scale serves both axes, so paper squares stay square. The
    // horizontal bound guarantees at least one whole cycle; extra width shows
    // additional beats at the same calibrated scale.
    const smallPx = plotWidth > 0 && plotHeight > 0
      ? Math.min(plotWidth / smallCellsForCycle, plotHeight / smallCellsForAmplitude)
      : 0;
    const pxPerMs = smallPx / SMALL_MS;
    const pxPerMv = smallPx / SMALL_MV;
    const zeroY = top + maxValue * pxPerMv;
    const availableCells = smallPx > 0
      ? Math.max(smallCellsForCycle, Math.floor(plotWidth / smallPx + 1e-9))
      : 0;
    const durationMs = availableCells * SMALL_MS;
    const rightEdge = left + plotWidth;
    const bottomEdge = top + plotHeight;

    return {
      width, height, left, right, top, bottom,
      plotWidth, plotHeight, rightEdge, bottomEdge,
      minValue, maxValue, cycleMs,
      smallMs: SMALL_MS, smallMv: SMALL_MV,
      largeMs: LARGE_MS, largeMv: LARGE_MV,
      smallPx, largePx: smallPx * (LARGE_MS / SMALL_MS),
      pxPerMs, pxPerMv, zeroY, durationMs,
      cycleCount: cycleMs > 0 ? Math.floor(durationMs / cycleMs) : 0,
      toX(timeMs) { return left + finite(timeMs, 0) * pxPerMs; },
      toY(valueMv) { return zeroY - finite(valueMv, 0) * pxPerMv; },
      timeAtX(x) { return pxPerMs > 0 ? (finite(x, left) - left) / pxPerMs : 0; },
      valueAtY(y) { return pxPerMv > 0 ? (zeroY - finite(y, zeroY)) / pxPerMv : 0; },
    };
  }

  return { layout, smallMs: SMALL_MS, smallMv: SMALL_MV, largeMs: LARGE_MS, largeMv: LARGE_MV };
});
