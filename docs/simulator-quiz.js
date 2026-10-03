/* Pure quiz-session state for the ECG simulator. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EPSimQuiz = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createSession(ids, random) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new TypeError('Quiz question ids must be a non-empty array.');
    }
    const seen = new Set();
    ids.forEach((id, index) => {
      if (typeof id !== 'string' || id.trim().length === 0) {
        throw new TypeError(`Quiz question id at index ${index} must be a non-empty string.`);
      }
      if (seen.has(id)) throw new Error(`Duplicate quiz question id: ${id}`);
      seen.add(id);
    });

    const rng = random === undefined ? Math.random : random;
    if (typeof rng !== 'function') throw new TypeError('Quiz random source must be a function.');

    const order = ids.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const value = rng();
      if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new RangeError('Quiz random source must return a finite number in [0, 1).');
      }
      const j = Math.floor(value * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    let position = 0;
    let isComplete = false;
    let selected = null;
    let isCorrect = null;
    let points = 0;

    const session = {
      get currentId() { return isComplete ? null : order[position]; },
      get index() { return position; },
      get total() { return order.length; },
      get answered() { return selected !== null; },
      get complete() { return isComplete; },
      get selectedId() { return selected; },
      get correct() { return isCorrect; },
      get score() { return points; },

      submit(id) {
        if (isComplete || selected !== null || !seen.has(id)) return null;
        selected = id;
        isCorrect = id === order[position];
        if (isCorrect) points++;
        return {
          correct: isCorrect,
          answer: order[position],
          selected: id,
          score: points,
          answeredCount: position + 1,
        };
      },

      next() {
        if (isComplete || selected === null) return false;
        if (position === order.length - 1) {
          isComplete = true;
          return true;
        }
        position++;
        selected = null;
        isCorrect = null;
        return true;
      },
    };
    return session;
  }

  return { createSession };
});
