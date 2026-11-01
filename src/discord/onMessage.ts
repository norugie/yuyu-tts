// Step [1]: decide whether a message should be spoken, and why not if it shouldn't.
// Pure, so every rule is unit tested without Discord.

export type SpeakInput = {
  authorIsBot: boolean;
  // Messages outside servers (DMs) are never read.
  guildId: string | null;
  // Voice channel the bot is in for this server, or null if not in voice.
  botVoiceChannelId: string | null;
  messageChannelId: string;
  // From /channel set; null = read the voice channel's own chat.
  readChannelId: string | null;
  authorOptedIn: boolean;
  // Text after normalization.
  text: string;
};

export type SkipReason = 'bot-author' | 'not-in-server' | 'bot-not-in-voice' | 'wrong-channel' | 'not-opted-in' | 'empty';
export type SpeakDecision = { speak: true } | { speak: false; reason: SkipReason };

export function decideSpeak(m: SpeakInput): SpeakDecision {
  // AC2.4: never read bots, including ourselves (no echo loops).
  if (m.authorIsBot) return { speak: false, reason: 'bot-author' };
  if (m.guildId === null) return { speak: false, reason: 'not-in-server' };
  if (m.botVoiceChannelId === null) return { speak: false, reason: 'bot-not-in-voice' };
  // AC2.7: the voice channel's chat by default, or the channel picked with /channel set.
  const readFrom = m.readChannelId ?? m.botVoiceChannelId;
  if (m.messageChannelId !== readFrom) return { speak: false, reason: 'wrong-channel' };
  // AC2.3: only people who ran /tts on in this server.
  if (!m.authorOptedIn) return { speak: false, reason: 'not-opted-in' };
  // AC2.5: e.g. a message that was only an image.
  if (m.text.trim() === '') return { speak: false, reason: 'empty' };
  return { speak: true };
}

// AC2.6: say who's talking ("Mika says, left door") when the speaker changes (default), always, or never.
// lastSpeakerId = who was spoken last in this voice session (undefined = nobody yet, e.g. right after /join).
// With on-change, the first message after joining is prefixed too, so listeners always know who started.
// After that, only a change of speaker adds the name again.
export function withNamePrefix(mode: 'always' | 'on-change' | 'never', lastSpeakerId: string | undefined, speakerId: string, name: string, text: string): string {
  const prefix = mode === 'always' || (mode === 'on-change' && lastSpeakerId !== speakerId);
  return prefix ? `${name} says, ${text}` : text;
}
