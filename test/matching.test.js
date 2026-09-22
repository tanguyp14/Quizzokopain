const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, isCloseMatch } = require('../src/matching');

test('normalize strips accents, case, punctuation and articles', () => {
  assert.equal(normalize('  Le Roi-Lion ! '), 'roi lion');
  assert.equal(normalize('Édith Piaf'), 'edith piaf');
  assert.equal(normalize("L'Arc-en-ciel"), 'arc en ciel');
});

test('isCloseMatch tolerates small typos but not wrong answers', () => {
  assert.ok(isCloseMatch('titanik', ['Titanic']));
  assert.ok(isCloseMatch('le seigneur des anneau', ['Le Seigneur des anneaux']));
  assert.ok(isCloseMatch('CO2', ['Dioxyde de carbone', 'CO2']));
  assert.ok(!isCloseMatch('Matrix', ['Titanic']));
  assert.ok(!isCloseMatch('chat', ['chou']), 'short words need an exact match');
  assert.ok(!isCloseMatch('', ['Titanic']));
});
