// Shared by normalize.ts and dictionary.ts (dictionary words are cleaned the same way as messages).

// Friend-group spelling (2026-11-01): 0 as o and 3 as e inside words, so "kn0wy" is read "knowy",
// "n00b" "noob" and "hell0" "hello". Only words made of letters plus 0/3 change, and only where a digit
// sits between letters, or at the end of a word with 3+ letters. So "300", "3rd", "3v3", "mp3", "ps3",
// "b2b" and "area51" stay as typed.
export function numberLetters(text: string): string {
  return text.replace(/[\p{L}\p{N}]+/gu, (word) => {
    if (!/^[\p{L}03]+$/u.test(word) || !/^\p{L}/u.test(word)) return word;
    const toLetters = (run: string) => run.replace(/0/g, 'o').replace(/3/g, 'e');
    let out = word.replace(/(?<=\p{L})[03]+(?=\p{L})/gu, toLetters);
    if ((out.match(/\p{L}/gu) ?? []).length >= 3) out = out.replace(/[03]+$/, toLetters);
    return out;
  });
}
