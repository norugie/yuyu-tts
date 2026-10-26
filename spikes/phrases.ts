// Pure helpers for reading config/phrases.txt and naming clip files.

// One phrase per line; blank lines and lines starting with # are ignored.
export function parsePhrases(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

// "eagle strike, get clear" → "eagle-strike-get-clear" (safe on Windows, max 40 chars).
export function slugify(phrase: string): string {
  const slug = phrase
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug === '' ? 'phrase' : slug;
}

// "01-left", "12-need-ammo": number prefix keeps files in phrase-list order.
export function clipName(index: number, phrase: string, suffix = ''): string {
  return `${String(index + 1).padStart(2, '0')}-${slugify(phrase)}${suffix}`;
}

// Kokoro is weaker on very short inputs. For short phrases, the render also tries punctuation variants
// to hear whether "left!" or "left." sounds better than "left" (ARCHITECTURE section 3).
export const SHORT_PHRASE_MAX_CHARS = 12;

export type Variant = { id: 'plain' | 'exclaim' | 'period'; text: string };

export function variantsFor(phrase: string): Variant[] {
  const plain: Variant = { id: 'plain', text: phrase };
  if (phrase.length > SHORT_PHRASE_MAX_CHARS || /[.!?]$/.test(phrase)) return [plain];
  return [plain, { id: 'exclaim', text: `${phrase}!` }, { id: 'period', text: `${phrase}.` }];
}

// CSV field quoting: phrases can contain commas and quotes.
export function csvField(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
