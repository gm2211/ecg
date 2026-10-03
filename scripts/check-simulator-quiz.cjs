'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const quiz = require('../simulator-quiz.js');

const ids = ['normal', 'rbbb', 'lbbb', 'wpw', 'avblock', 'avrt'];
const fixedRandom = value => () => value;

// Fisher–Yates consumes one injected value per swap and produces a stable order.
const shuffled = quiz.createSession(['a', 'b', 'c', 'd'], fixedRandom(0));
assert.equal(shuffled.currentId, 'b');
assert.equal(shuffled.total, 4);
assert.equal(shuffled.index, 0);

// Every seeded run presents six unique questions exactly once, with no repeats.
for (let seed = 1; seed <= 6; seed++) {
  let state = seed;
  const random = () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const session = quiz.createSession(ids, random);
  const order = [];
  while (!session.complete) {
    order.push(session.currentId);
    assert.equal(session.submit(session.currentId).correct, true);
    assert.equal(session.next(), true);
  }
  assert.deepEqual(order.slice().sort(), ids.slice().sort());
  assert.equal(new Set(order).size, ids.length);
  assert.equal(order.length, ids.length);
  assert.equal(session.currentId, null);
  assert.equal(session.index, ids.length - 1);
  assert.equal(session.score, ids.length);
}

// Invalid submissions do not change state or score; repeated submission is ignored.
const session = quiz.createSession(['a', 'b'], fixedRandom(0.5));
assert.equal(session.submit('missing'), null);
assert.equal(session.answered, false);
assert.equal(session.score, 0);
assert.equal(session.next(), false, 'Cannot advance before answering');
const first = session.currentId;
const wrong = first === 'a' ? 'b' : 'a';
const incorrect = session.submit(wrong);
assert.deepEqual(incorrect, {
  correct: false, answer: first, selected: wrong, score: 0, answeredCount: 1,
});
assert.equal(session.answered, true);
assert.equal(session.selectedId, wrong);
assert.equal(session.correct, false);
assert.equal(session.submit(first), null, 'A second answer cannot change score');
assert.equal(session.score, 0);
assert.equal(session.next(), true);
assert.equal(session.index, 1);
assert.equal(session.answered, false);
assert.equal(session.selectedId, null);
assert.equal(session.correct, null);

// Correct and incorrect answers update score once; completion is terminal.
const last = session.currentId;
assert.equal(session.submit(last).score, 1);
assert.equal(session.submit(wrong), null);
assert.equal(session.next(), true);
assert.equal(session.complete, true);
assert.equal(session.currentId, null);
assert.equal(session.submit(last), null);
assert.equal(session.next(), false);
assert.equal(session.score, 1);

// Sessions own their order and score independently.
const left = quiz.createSession(['x', 'y'], fixedRandom(0));
const right = quiz.createSession(['x', 'y'], fixedRandom(0.99));
assert.notEqual(left.currentId, right.currentId);
left.submit(left.currentId);
assert.equal(left.score, 1);
assert.equal(right.score, 0);

// Reject malformed question sets and invalid random sources explicitly.
for (const bad of [undefined, null, [], 'a']) {
  assert.throws(() => quiz.createSession(bad), /non-empty array/);
}
assert.throws(() => quiz.createSession(['a', '']), /non-empty string/);
assert.throws(() => quiz.createSession(['a', 'a']), /Duplicate quiz question id/);
assert.throws(() => quiz.createSession(['a', 'b'], 1), /random source must be a function/);
assert.throws(() => quiz.createSession(['a', 'b'], () => 1), /finite number in \[0, 1\)/);

// The browser UMD path publishes the same API under EPSimQuiz.
const browser = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../simulator-quiz.js'), 'utf8'), browser);
assert.equal(typeof browser.EPSimQuiz.createSession, 'function');
assert.equal(browser.EPSimQuiz.createSession(['a'], fixedRandom(0)).currentId, 'a');

console.log('PASS: deterministic quiz shuffle, six unique questions, guarded answers, scoring, completion, session isolation, validation, and browser/CommonJS exports.');
