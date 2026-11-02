// decideSpeak() runs before the text is normalized, so messages that won't be
// read cost nothing more; decideText() checks the normalized text afterwards.

export type SpeakInput = {
  authorIsBot: boolean;
  guildId: string | null;
  botVoiceChannelId: string | null;
  messageChannelId: string;
  // From /channel set; null = read the voice channel's own chat.
  readChannelId: string | null;
  authorOptedIn: boolean;
};

export type SkipReason = 'bot-author' | 'not-in-server' | 'bot-not-in-voice' | 'wrong-channel' | 'not-opted-in' | 'empty';
export type SpeakDecision = { speak: true } | { speak: false; reason: SkipReason };

export function decideSpeak(m: SpeakInput): SpeakDecision {
  // Never read bots, including ourselves (no echo loops).
  if (m.authorIsBot) return { speak: false, reason: 'bot-author' };
  if (m.guildId === null) return { speak: false, reason: 'not-in-server' };
  if (m.botVoiceChannelId === null) return { speak: false, reason: 'bot-not-in-voice' };
  const readFrom = m.readChannelId ?? m.botVoiceChannelId;
  if (m.messageChannelId !== readFrom) return { speak: false, reason: 'wrong-channel' };
  if (!m.authorOptedIn) return { speak: false, reason: 'not-opted-in' };
  return { speak: true };
}

export function decideText(text: string): SpeakDecision {
  return text.trim() === '' ? { speak: false, reason: 'empty' } : { speak: true };
}

// With on-change, the first message after /join is prefixed too; after that, only a new speaker is.
export function withNamePrefix(mode: 'always' | 'on-change' | 'never', lastSpeakerId: string | undefined, speakerId: string, name: string, text: string): string {
  const prefix = mode === 'always' || (mode === 'on-change' && lastSpeakerId !== speakerId);
  return prefix ? `${name} says. ${capitalizeFirst(text)}` : text;
}

// The name is its own sentence, so Kokoro starts the message fresh and a "?" or "!"
// at the end still sounds like a question or exclamation, instead of the end of "X says, ...".
function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
