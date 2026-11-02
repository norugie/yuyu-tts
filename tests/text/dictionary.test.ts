// PRD F8: dictionary file, merging a server's /dict changes, whole-word replacement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDictionary, cleanWord, createDictionaryCache, dictEntryError, DictionaryError, loadDictionary, mergeDictionary, parseDictionary, type DictOverride } from '../../src/text/dictionary.ts';

test('config/dictionary.json holds the reviewed starter words (AC8.2)', () => {
  assert.deepEqual(Object.fromEntries(loadDictionary('config/dictionary.json')), {
    gg: 'good game',
    brb: 'be right back',
    omw: 'on my way',
    ty: 'thank you',
    np: 'no problem',
    lol: 'L O L',
    // Respelled so Kokoro's pronouncer gets them right (checked with misaki + espeak, the same G2P
    // Kokoro uses): "nyeh" was read "nigh-ah" and "hmeh" "aitch-may".
    nyeh: 'knee-yeh',
    hmeh: 'hih-meh',
  });
});

test('parseDictionary lowercases words and lists every problem at once', () => {
  assert.deepEqual([...parseDictionary({ ' OMW ': ' on my way ' })], [['omw', 'on my way']]);
  assert.throws(() => parseDictionary(['x']), DictionaryError);
  assert.throws(
    () => parseDictionary({ a: 1, '': 'x', b: '' }),
    (err: Error) => err instanceof DictionaryError && /"a"/.test(err.message) && /"b"/.test(err.message) && /empty/.test(err.message),
  );
});

test('dictEntryError checks what /dict add accepts', () => {
  assert.equal(dictEntryError('omw', 'on my way'), null);
  assert.equal(dictEntryError('gg wp', 'good game, well played'), null);
  assert.match(dictEntryError('  ', 'x')!, /empty/);
  assert.match(dictEntryError('!!', 'x')!, /letter, number or emoji/);
  assert.match(dictEntryError('x'.repeat(33), 'x')!, /33/);
  assert.match(dictEntryError('omw', ' ')!, /how to say/);
  assert.equal(cleanWord('  Gg   WP '), 'gg wp');
  assert.equal(cleanWord('KN0WY'), 'knowy');
  assert.equal(dictEntryError('🍥', 'fishcake'), null);
  assert.equal(cleanWord('❤️'), '❤');
});

test('mergeDictionary: server words are added or override, and "" switches a default off', () => {
  const defaults = new Map([['gg', 'good game'], ['ty', 'thank you']]);
  const merged = mergeDictionary(defaults, [
    { word: 'gg', spoken: 'gee gee' },
    { word: 'ty', spoken: '' },
    { word: 'kn0wy', spoken: 'oh they know' },
  ]);
  assert.deepEqual(Object.fromEntries(merged), { gg: 'gee gee', 'kn0wy': 'oh they know' });
  assert.equal(defaults.get('ty'), 'thank you', 'defaults are not changed');
});

test('applyDictionary: whole words only, any capitals, longest match first, special characters are literal', () => {
  const d = new Map([['gg', 'good game'], ['gg wp', 'good game, well played'], ['c++', 'c plus plus'], ['é', 'e accent']]);
  assert.equal(applyDictionary('GG WP everyone', d), 'good game, well played everyone');
  assert.equal(applyDictionary('gg. eggs, ggs', d), 'good game. eggs, ggs');
  assert.equal(applyDictionary('I like c++ a lot', d), 'I like c plus plus a lot');
  assert.equal(applyDictionary('café é', d), 'café e accent');
  assert.equal(applyDictionary('anything', new Map()), 'anything');
});

test('applyDictionary: emoji entries work next to words, other emoji and punctuation', () => {
  const d = new Map([['🍥', 'fishcake'], ['❤', 'heart']]);
  assert.equal(applyDictionary('yum 🍥', d), 'yum fishcake');
  assert.equal(applyDictionary('yum🍥🍥!', d), 'yum fishcake fishcake!');
  assert.equal(applyDictionary('🍥, nice', d), 'fishcake, nice');
  assert.equal(applyDictionary('love ❤ 🍜', d), 'love heart 🍜');
});

test('AC10.5: a server dictionary is read once and reused until that server\'s /dict changes', () => {
  const rows = new Map<string, DictOverride[]>([['g1', [{ word: 'omw', spoken: 'coming' }]]]);
  const reads: string[] = [];
  const cache = createDictionaryCache(new Map([['gg', 'good game'], ['omw', 'on my way']]), (g) => {
    reads.push(g);
    return rows.get(g) ?? [];
  });
  const first = cache.get('g1');
  assert.equal(cache.get('g1'), first, 'same object, so its pattern is reused too');
  assert.equal(applyDictionary('omw gg', first), 'coming good game');
  assert.equal(applyDictionary('gg omw', cache.get('g2')), 'good game on my way');
  assert.deepEqual(reads, ['g1', 'g2']);

  rows.set('g1', [{ word: 'omw', spoken: '' }]);
  cache.invalidate('g1');
  assert.equal(applyDictionary('omw gg', cache.get('g1')), 'omw good game');
  assert.deepEqual(reads, ['g1', 'g2', 'g1']);
});

test('the same dictionary gives the same result on repeat calls (reused pattern)', () => {
  const d = new Map([['ty', 'thank you']]);
  assert.equal(applyDictionary('ty ty', d), 'thank you thank you');
  assert.equal(applyDictionary('ty!', d), 'thank you!');
});
