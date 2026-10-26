import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhrases, slugify, clipName, variantsFor, csvField } from '../../spikes/phrases.ts';

test('parsePhrases skips comments and blank lines, handles CRLF', () => {
  assert.deepEqual(parsePhrases('# header\r\nleft\r\n\r\n  behind you  \n# group\nhelp\n'), ['left', 'behind you', 'help']);
});

test('slugify makes Windows-safe names', () => {
  assert.equal(slugify("I'm stuck"), 'im-stuck');
  assert.equal(slugify('eagle strike, get clear'), 'eagle-strike-get-clear');
  assert.equal(slugify('???'), 'phrase');
  assert.ok(slugify('a'.repeat(100)).length <= 40);
});

test('clipName keeps list order with a 2-digit prefix', () => {
  assert.equal(clipName(0, 'left'), '01-left');
  assert.equal(clipName(11, 'need ammo', '-exclaim'), '12-need-ammo-exclaim');
});

test('short phrases get punctuation variants, long or punctuated ones do not', () => {
  assert.deepEqual(variantsFor('left').map((v) => v.text), ['left', 'left!', 'left.']);
  assert.equal(variantsFor('who wants to do one more mission before we stop for the night?').length, 1);
  assert.equal(variantsFor('help!').length, 1);
});

test('csvField quotes commas and quotes', () => {
  assert.equal(csvField('left'), 'left');
  assert.equal(csvField('eagle strike, get clear'), '"eagle strike, get clear"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
});
