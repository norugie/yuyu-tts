import type { Message } from 'discord.js';
import { normalize, type Names } from '../text/normalize.ts';
import { resolveVoice } from '../tts/presets.ts';
import { speechFor } from '../tts/speech.ts';
import type { BotContext } from './context.ts';
import { decideSpeak, decideText, withNamePrefix, type SpeakDecision } from './onMessage.ts';

export function handleMessage(message: Message, ctx: BotContext): void {
  const receivedAt = Date.now();
  // Cheap checks first, so bot messages and DMs never touch the database.
  if (message.author.bot || !message.inGuild()) return;
  // Not a session that is still connecting: its audio would have nowhere to go yet.
  const session = ctx.sessions.getReady(message.guildId);
  if (session === undefined) return;

  const guild = ctx.settings.getGuild(message.guildId);
  const member = ctx.settings.getMember(message.guildId, message.author.id);
  const skip = (decision: SpeakDecision & { speak: false }) =>
    ctx.log.debug('not speaking', { guild: message.guildId, message: message.id, reason: decision.reason });

  // Channel and opt-in first, so messages that won't be read never touch the dictionary.
  const decision = decideSpeak({
    authorIsBot: message.author.bot,
    guildId: message.guildId,
    botVoiceChannelId: session.channelId,
    messageChannelId: message.channelId,
    readChannelId: guild.readChannelId,
    authorOptedIn: member.optedIn,
  });
  if (!decision.speak) return skip(decision);

  const names: Names = {
    user: (id) => message.mentions.members?.get(id)?.displayName ?? message.mentions.users.get(id)?.displayName,
    role: (id) => message.mentions.roles.get(id)?.name,
    channel: (id) => message.guild.channels.cache.get(id)?.name,
  };
  const text = normalize(message.content, { names, maxChars: guild.maxChars, dictionary: ctx.dictionaries.get(message.guildId) });
  const textDecision = decideText(text);
  if (!textDecision.speak) return skip(textDecision);

  const voice = resolveVoice(ctx.presets, ctx.settings.getUser(message.author.id));
  const name = member.spokenName ?? message.member?.displayName ?? message.author.displayName;
  const spoken = withNamePrefix(guild.namePrefix, session.lastSpeakerId, message.author.id, name, text);
  session.lastSpeakerId = message.author.id;

  session.queue.enqueue({
    ...speechFor(spoken, voice),
    receivedAt,
    messageId: message.id,
    userId: message.author.id,
  });
}
