// E3: the normalization table (PRD F7, tasks 5.1/5.2). Each row is a tricky input and what should be spoken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, cutAtWord } from '../../src/text/normalize.ts';
import { cleanWord, loadDictionary, mergeDictionary } from '../../src/text/dictionary.ts';

const dictionary = loadDictionary('config/dictionary.json');

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

  // AC7.3: runs of 4+ identical emoji become one; 3 or fewer stay.
  ['lol 😂😂😂😂😂', 'L O L 😂'],
  ['gg 🔥 🔥 🔥 🔥', 'good game 🔥'],
  ['nice 😂😂😂', 'nice 😂😂😂'],
  ['<:pog:1> <:pog:1> <:pog:1> <:pog:1> <:pog:1>', 'pog'],
  ['<:pog:1><:pog:1><:pog:1>', 'pog pog pog'],

  // AC7.6: repeated letters and punctuation.
  ['noooooooo', 'nooo'],
  ['nooo', 'nooo'],
  ['yesss', 'yesss'],
  ['wait!!!!!', 'wait!'],
  ['really???', 'really?'],
  ['what?!?!', 'what?!'],
  ['what!?', 'what?!'],
  ['hmm......', 'hmm...'],
  ['hmm...', 'hmm...'],
  ['are you coming?', 'are you coming?'],
  ['left door!', 'left door!'],

  // AC7.8: a fully shouted message is lowercased; short acronyms are left alone.
  ['RUN IT IS FOLLOWING ME', 'run it is following me'],
  ['GET OUT!!!', 'get out!'],
  ['LC', 'LC'],
  ['OK', 'OK'],
  ['going to LC now', 'going to LC now'],

  // Friend-group spelling: 0 as o and 3 as e, only between letters.
  ['kn0wy', 'knowy'],
  ['KN0WY', 'knowy'],
  ['kn0wy?', 'knowy?'],
  ['ps3 or mp3', 'ps3 or mp3'],
  ['l33t', 'leet'],
  ['top 3', 'top 3'],
  ['n00b', 'noob'],
  ['h3ll0 th3r3', 'hello there'],
  ['300 credits', '300 credits'],
  ['3rd floor', '3rd floor'],
  ['3v3 later', '3v3 later'],
  ['an mp3 file', 'an mp3 file'],
  ['back in 10', 'back in 10'],
  ['area 51 and b2b', 'area 51 and b2b'],

  // AC8.1: the dictionary replaces whole words, ignoring capitals.
  ['omw', 'on my way'],
  ['OMW!', 'on my way!'],
  ['gg wp', 'good game wp'],
  ['ty np', 'thank you no problem'],
  ['brb, food', 'be right back, food'],
  ['pretty empty typo', 'pretty empty typo'],
  ["ty's", "ty's"],
  ['lolol', 'lolol'],
  ['Nyeh!', 'knee-yeh!'],

  // Tilde: dropped (Kokoro would say "tilde"), except "~50" = about 50.
  ['hello~', 'hello'],
  ['see you~!', 'see you!'],
  ['hiii~ ~ yay~~', 'hiii yay'],
  ['~50 credits left', 'about 50 credits left'],
  ['~~nope~~ ok', 'nope ok'],
  ['hmeh...', 'hih-meh...'],
];

for (const [input, expected] of cases) {
  test(`normalize ${JSON.stringify(input)}`, () => assert.equal(normalize(input, { names, dictionary }), expected));
}

test('without a dictionary, words are left as typed', () => {
  assert.equal(normalize('omw gg', { names }), 'omw gg');
});

test('number letters run before the dictionary, so a typed "l0l" is still L O L', () => {
  assert.equal(normalize('l0l', { names, dictionary }), 'L O L');
});

test('AC7.7: long text is cut at a word boundary with "and so on"', () => {
  const long = 'word '.repeat(100).trim();
  const out = normalize(long, { names, maxChars: 30 });
  assert.equal(out, 'word word word word word word, and so on');
  assert.equal(cutAtWord('short', 30), 'short');
  // One giant word: cut mid-word rather than return nothing.
  assert.equal(cutAtWord('a'.repeat(50), 10), `${'a'.repeat(10)}, and so on`);
});

test('a /dict word typed with numbers ("kn0wy") still matches the message', () => {
  const withKnowy = mergeDictionary(dictionary, [{ word: cleanWord('kn0wy'), spoken: 'oh they know' }]);
  assert.equal(normalize('kn0wy lol', { names, dictionary: withKnowy }), 'oh they know L O L');
});

test('emoji added with /dict are read the new way, with or without the invisible style character', () => {
  const d = mergeDictionary(dictionary, [{ word: cleanWord('🍥'), spoken: 'fishcake' }, { word: cleanWord('❤️'), spoken: 'heart' }]);
  assert.equal(normalize('ramen time🍥🍥', { names, dictionary: d }), 'ramen time fishcake fishcake');
  assert.equal(normalize('ty ❤️ and ❤', { names, dictionary: d }), 'thank you heart and heart');
  assert.equal(normalize('🍥🍥🍥🍥🍥', { names, dictionary: d }), 'fishcake');
});
