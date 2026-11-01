// Step [2]: turn a Discord message into text that sounds right when read aloud. Pure functions only.
// This is the basic version for phase 3 (task 3.10). Phase 5 adds the full rule table (E3),
// repeated characters, all caps and the game-term dictionary.

export type Names = {
  // Look up display names for mentions. Return undefined if unknown.
  user(id: string): string | undefined;
  role(id: string): string | undefined;
  channel(id: string): string | undefined;
};

export type NormalizeOptions = {
  names: Names;
  // PRD AC7.7: cut long messages at a word boundary. Default 300.
  maxChars?: number;
};

const NO_NAMES: Names = { user: () => undefined, role: () => undefined, channel: () => undefined };

export function normalize(input: string, opts: NormalizeOptions = { names: NO_NAMES }): string {
  const { names, maxChars = 300 } = opts;
  let text = input;

  // Code blocks first, so nothing inside them gets read (AC7.4).
  text = text.replace(/```[\s\S]*?```/g, ' code block ');
  // Spoilers (AC7.5).
  text = text.replace(/\|\|[\s\S]+?\|\|/g, ' spoiler ');
  // Mentions (AC7.2).
  text = text.replace(/<@!?(\d+)>/g, (_, id: string) => names.user(id) ?? 'someone');
  text = text.replace(/<@&(\d+)>/g, (_, id: string) => names.role(id) ?? 'a role');
  text = text.replace(/<#(\d+)>/g, (_, id: string) => names.channel(id) ?? 'a channel');
  // Custom emoji <:pog:123> / <a:dance:123> → their name (AC7.3).
  text = text.replace(/<a?:(\w+):\d+>/g, (_, name: string) => ` ${name.replace(/_/g, ' ')} `);
  // Discord timestamps <t:1700000000:R> → "a time".
  text = text.replace(/<t:\d+(:\w)?>/g, 'a time');
  // URLs (AC7.1).
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
  text = text.replace(/\s+/g, ' ').trim();

  return cutAtWord(text, maxChars);
}

// AC7.7: cut at a word boundary and say "and so on" so listeners know it was cut.
export function cutAtWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars + 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = (lastSpace > maxChars * 0.5 ? slice.slice(0, lastSpace) : text.slice(0, maxChars)).replace(/[\s,;:.!?-]+$/, '');
  return `${cut}, and so on`;
}
