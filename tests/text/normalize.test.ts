// Basic normalization (task 3.10). The full E3 table comes in phase 5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, cutAtWord } from '../../src/text/normalize.ts';

const names = {
  user: (id: string) => ({ '111111111111111111': 'Mika' })[id],
  role: (id: string) => ({ '222222222222222222': 'Divers' })[id],
  channel: (id: string) => ({ '333333333333333333': 'general' })[id],
};

const cases: [string, string][] = [
  ['  left   door  ', 'left door'],
  ['hey <@111111111111111111> and <@!111111111111111111>', 'hey Mika and Mika'],
  ['ping <@&222222222222222222> in <#333333333333333333>', 'ping Divers in general'],
  ['who is <@999999999999999999>', 'who is someone'],
  ['nice <:pog_champ:123456> <a:dance:789>', 'nice pog champ dance'],
  ['look https://www.youtube.com/watch?v=x', 'look link to youtube'],
  ['map: https://example.com/a?b=c', 'map: link'],
  ['```js\nconst x = 1\n```', 'code block'],
  ['the answer is ||bracken||', 'the answer is spoiler'],
  ['**go** __now__ ~~maybe~~ `cmd`', 'go now maybe cmd'],
  ['> quoted text', 'quoted text'],
  ['', ''],
];

for (const [input, expected] of cases) {
  test(`normalize ${JSON.stringify(input)}`, () => assert.equal(normalize(input, { names }), expected));
}

test('AC7.7: long text is cut at a word boundary with "and so on"', () => {
  const long = 'word '.repeat(100).trim();
  const out = normalize(long, { names, maxChars: 30 });
  assert.equal(out, 'word word word word word word, and so on');
  assert.equal(cutAtWord('short', 30), 'short');
  // One giant word: cut mid-word rather than return nothing.
  assert.equal(cutAtWord('a'.repeat(50), 10), `${'a'.repeat(10)}, and so on`);
});
