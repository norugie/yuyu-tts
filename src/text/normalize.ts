// Pure functions only. Every rule is pinned by the table in tests/text/normalize.test.ts.

import { applyDictionary, type DictEntries } from './dictionary.ts';
import { numberLetters } from './letters.ts';

export type Names = {
  user(id: string): string | undefined;
  role(id: string): string | undefined;
  channel(id: string): string | undefined;
};

export type NormalizeOptions = {
  names: Names;
  // Cut long messages at a word boundary. Default 300.
  maxChars?: number;
  dictionary?: DictEntries;
};

const NO_NAMES: Names = { user: () => undefined, role: () => undefined, channel: () => undefined };

export function normalize(input: string, opts: NormalizeOptions = { names: NO_NAMES }): string {
  const { names, maxChars = 300, dictionary } = opts;
  let text = input;

  // Code blocks first, so nothing inside them gets read.
  text = text.replace(/```[\s\S]*?```/g, ' code block ');
  text = text.replace(/\|\|[\s\S]+?\|\|/g, ' spoiler ');
  text = text.replace(/<@!?(\d+)>/g, (_, id: string) => names.user(id) ?? 'someone');
  text = text.replace(/<@&(\d+)>/g, (_, id: string) => names.role(id) ?? 'a role');
  text = text.replace(/<#(\d+)>/g, (_, id: string) => names.channel(id) ?? 'a channel');
  // The invisible emoji style character, so "❤️" and "❤" are treated the same (and match /dict).
  text = text.replace(/\uFE0F/g, '');
  // Runs of 4+ identical emoji → one, before custom emoji become words.
  text = text.replace(/(<a?:\w+:\d+>)(?:\s*\1){3,}/g, '$1');
  text = text.replace(/(\p{Extended_Pictographic}\uFE0F?)(?:\s*\1){3,}/gu, '$1');
  // Custom emoji <:pog:123> / <a:dance:123> → their name.
  text = text.replace(/<a?:(\w+):\d+>/g, (_, name: string) => ` ${name.replace(/_/g, ' ')} `);
  // Discord timestamps <t:1700000000:R> → "a time".
  text = text.replace(/<t:\d+(:\w)?>/g, 'a time');
  text = text.replace(/https?:\/\/\S+/gi, (url) => {
    const host = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    })();
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'link to youtube';
    return 'link';
  });
  // Markdown that would otherwise be read as symbols: **bold**, __underline__, ~~strike~~, `code`, > quotes.
  text = text.replace(/(\*\*|__|~~|`)/g, '').replace(/^\s*>+\s?/gm, '');
  // "~50" means about 50; any other "~" is dropped, because Kokoro reads it as
  // "tilde" or swallows the word before it. Kokoro can't make it sound playful, so silence is best.
  text = text.replace(/~(?=\d)/g, 'about ').replace(/~/g, ' ').replace(/ +([,.!?;:])/g, '$1');
  text = text.replace(/\s+/g, ' ').trim();

  text = shortenRepeats(text);
  text = lowercaseShouting(text);
  text = numberLetters(text);
  if (dictionary !== undefined) text = applyDictionary(text, dictionary);

  return cutAtWord(text, maxChars);
}

// "noooooo" → "nooo", "!!!!!" → "!", "???" → "?", "?!?!" → "?!", "......" → "...".
// Kept: three letters (still sounds drawn out), one "?!" (sounds surprised), "..." (a pause).
export function shortenRepeats(text: string): string {
  return text
    .replace(/(\p{L})\1{3,}/gu, '$1$1$1')
    .replace(/[!?]{2,}/g, (run) => (run.includes('?') && run.includes('!') ? '?!' : run[0]!))
    .replace(/\.{4,}/g, '...');
}

// A fully shouted message is lowercased, so Kokoro reads words instead of spelling letters
// ("RUN" could come out as "R, U, N"). Needs 4+ letters, so short acronyms like "LC" or "OK" stay.
export function lowercaseShouting(text: string): string {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 4 || /\p{Ll}/u.test(text)) return text;
  return text.toLowerCase();
}

// Cut at a word boundary and say "and so on" so listeners know it was cut.
export function cutAtWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars + 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = (lastSpace > maxChars * 0.5 ? slice.slice(0, lastSpace) : text.slice(0, maxChars)).replace(/[\s,;:.!?-]+$/, '');
  return `${cut}, and so on`;
}
