import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toRatings, summarize } from '../../evals/voice-quality/ratings.ts';

const HEADER = 'candidate,clip,phrase,variant,clarity_1to5,cute_1to5,rater,notes';

test('parseCsv handles quoted commas, escaped quotes and CRLF', () => {
  assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\r\nd,e,f\r\n'), [['a', 'b, c', 'say "hi"'], ['d', 'e', 'f']]);
});

test('toRatings skips unrated rows and reads scores', () => {
  const csv = [HEADER, 'sakura,01-left,left,plain,5,4,Mika,', 'sakura,02-right,right,plain,,,,', 'momo,01-left,left,plain,3,,Youmu,'].join('\n');
  const ratings = toRatings(parseCsv(csv));
  assert.equal(ratings.length, 2);
  assert.deepEqual(ratings[1], { candidate: 'momo', clip: '01-left', variant: 'plain', clarity: 3, cute: undefined, rater: 'Youmu' });
});

test('toRatings rejects scores outside 1–5 with the row number', () => {
  assert.throws(() => toRatings(parseCsv(`${HEADER}\nsakura,01-left,left,plain,7,4,Mika,`)), /row 2: score must be 1–5/);
});

test('toRatings reports a missing column', () => {
  assert.throws(() => toRatings(parseCsv('candidate,clip\nx,y')), /missing the "variant" column/);
});

test('summarize averages per candidate, best clarity first', () => {
  const csv = [HEADER, 'momo,a,a,plain,3,5,M,', 'sakura,a,a,plain,5,4,M,', 'sakura,b,b,plain,4,2,M,'].join('\n');
  const s = summarize(toRatings(parseCsv(csv)));
  assert.deepEqual(s, [
    { key: 'sakura', n: 2, clarity: 4.5, cute: 3 },
    { key: 'momo', n: 1, clarity: 3, cute: 5 },
  ]);
});
