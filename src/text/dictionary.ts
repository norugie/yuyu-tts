import { readFileSync } from 'node:fs';
import { numberLetters } from './letters.ts';
import { ProblemsError } from '../config.ts';

export const DICT_WORD_MAX = 32;
export const DICT_SPOKEN_MAX = 100;

export type DictEntries = ReadonlyMap<string, string>;

// spoken '' = "don't replace this default word here".
export type DictOverride = { word: string; spoken: string };

export class DictionaryError extends ProblemsError {
  constructor(problems: string[]) {
    super('config/dictionary.json has problems:', problems);
  }
}

// So "OMW " and "omw" are one word, and "kn0wy" is saved as "knowy" (messages get the same 0/3 rule).
// U+FE0F is dropped, so "❤" and "❤️" are the same entry.
export function cleanWord(word: string): string {
  return numberLetters(word.replace(/\uFE0F/g, '').replace(/\s+/g, ' ').trim().toLowerCase());
}

const EMOJI = /\p{Extended_Pictographic}/u;

export function dictEntryError(word: string, spoken: string): string | null {
  const w = cleanWord(word);
  if (w === '') return 'The word is empty.';
  if (w.length > DICT_WORD_MAX) return `Keep the word under ${DICT_WORD_MAX + 1} characters.`;
  // Needs a letter, digit or emoji (🍥), or it could never match.
  if (!/[\p{L}\p{N}]/u.test(w) && !EMOJI.test(w)) return 'The word needs at least one letter, number or emoji.';
  const s = spoken.trim();
  if (s === '') return 'Tell me how to say it.';
  if (s.length > DICT_SPOKEN_MAX) return `Keep "say" under ${DICT_SPOKEN_MAX + 1} characters.`;
  return null;
}

export function parseDictionary(json: unknown): DictEntries {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new DictionaryError(['expected an object like { "omw": "on my way" }']);
  }
  const problems: string[] = [];
  const entries = new Map<string, string>();
  for (const [word, spoken] of Object.entries(json)) {
    if (typeof spoken !== 'string') {
      problems.push(`"${word}": the spoken form must be text`);
      continue;
    }
    const err = dictEntryError(word, spoken);
    if (err !== null) problems.push(`"${word}": ${err}`);
    else entries.set(cleanWord(word), spoken.trim());
  }
  if (problems.length > 0) throw new DictionaryError(problems);
  return entries;
}

export function loadDictionary(path: string): DictEntries {
  return parseDictionary(JSON.parse(readFileSync(path, 'utf8')));
}

export function mergeDictionary(defaults: DictEntries, overrides: readonly DictOverride[]): DictEntries {
  const merged = new Map(defaults);
  for (const { word, spoken } of overrides) {
    if (spoken === '') merged.delete(word);
    else merged.set(word, spoken);
  }
  return merged;
}

// One server's dictionary, merged once and kept until that server's /dict changes,
// instead of reading the database and rebuilding it for every message.
export type DictionaryCache = {
  get(guildId: string): DictEntries;
  // Call after /dict add or remove in that server.
  invalidate(guildId: string): void;
};

export function createDictionaryCache(defaults: DictEntries, overrides: (guildId: string) => readonly DictOverride[]): DictionaryCache {
  const byGuild = new Map<string, DictEntries>();
  return {
    get(guildId) {
      let entries = byGuild.get(guildId);
      if (entries === undefined) {
        entries = mergeDictionary(defaults, overrides(guildId));
        byGuild.set(guildId, entries);
      }
      return entries;
    },
    invalidate: (guildId) => void byGuild.delete(guildId),
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Longer entries come first, so "gg wp" wins over "gg".
function buildPattern(entries: DictEntries): RegExp {
  const byLength = [...entries.keys()].sort((a, b) => b.length - a.length);
  // Emoji-only entries (🍥) match anywhere, even glued to a word ("yum🍥").
  const isEmojiOnly = (w: string) => EMOJI.test(w) && !/[\p{L}\p{N}]/u.test(w);
  const words = byLength.filter((w) => !isEmojiOnly(w)).map(escape);
  const emoji = byLength.filter(isEmojiOnly).map(escape);
  // A "word" edge = not next to another letter, number or apostrophe (so "ty" doesn't hit "ty's" or "pretty").
  const parts = [];
  if (words.length > 0) parts.push(`(?<![\\p{L}\\p{N}'])(?:${words.join('|')})(?![\\p{L}\\p{N}'])`);
  if (emoji.length > 0) parts.push(`(?:${emoji.join('|')})`);
  return new RegExp(parts.join('|'), 'giu');
}

// Patterns are remembered per dictionary object, so a cached server dictionary builds its
// pattern once. WeakMap: when a dictionary is dropped from the cache, its pattern goes with it.
const patterns = new WeakMap<DictEntries, RegExp>();

export function applyDictionary(text: string, entries: DictEntries): string {
  if (entries.size === 0) return text;
  let re = patterns.get(entries);
  if (re === undefined) {
    re = buildPattern(entries);
    patterns.set(entries, re);
  }
  // Emoji sit right next to words and each other ("yum🍥🍥"), so their spoken form gets spaces around it,
  // then extra spaces (and spaces before punctuation) are tidied up.
  return text
    .replace(re, (m) => {
      const spoken = entries.get(m.toLowerCase()) ?? m;
      return EMOJI.test(m) ? ` ${spoken} ` : spoken;
    })
    .replace(/ {2,}/g, ' ')
    .replace(/ ([,.!?;:])/g, '$1')
    .trim();
}
