// messageCreate → filter → normalize → name prefix → queue (task 3.10).

import type { Message } from 'discord.js';
import { normalize, type Names } from '../text/normalize.ts';
import { resolveVoice } from '../tts/presets.ts';
import type { BotContext } from './context.ts';
import { decideSpeak, withNamePrefix } from './onMessage.ts';

export function handleMessage(message: Message, ctx: BotContext): void {
  const receivedAt = Date.now();
  // Cheap checks first, so bot messages and DMs never touch the database.
  if (message.author.bot || !message.inGuild()) return;
  const session = ctx.sessions.get(message.guildId);
  if (session === undefined) return;

  const guild = ctx.settings.getGuild(message.guildId);
  const names: Names = {
    user: (id) => message.mentions.members?.get(id)?.displayName ?? message.mentions.users.get(id)?.displayName,
    role: (id) => message.mentions.roles.get(id)?.name,
    channel: (id) => message.guild.channels.cache.get(id)?.name,
  };
  const text = normalize(message.content, { names, maxChars: guild.maxChars });

  const decision = decideSpeak({
    authorIsBot: message.author.bot,
    guildId: message.guildId,
    botVoiceChannelId: session.channelId,
    messageChannelId: message.channelId,
    readChannelId: guild.readChannelId,
    authorOptedIn: ctx.settings.isOptedIn(message.guildId, message.author.id),
    text,
  });
  if (!decision.speak) {
    ctx.log.debug('not speaking', { guild: message.guildId, message: message.id, reason: decision.reason });
    return;
  }

  const voice = resolveVoice(ctx.presets, ctx.settings.getUser(message.author.id));
  // The nickname from /tts on name:..., or their Discord display name.
  const name = ctx.settings.getSpokenName(message.guildId, message.author.id) ?? message.member?.displayName ?? message.author.displayName;
  const spoken = withNamePrefix(guild.namePrefix, session.lastSpeakerId, message.author.id, name, text);
  session.lastSpeakerId = message.author.id;

  session.queue.enqueue({
    text: spoken,
    voice: voice.voice,
    speed: voice.speed,
    semitones: voice.semitones,
    extraPitch: voice.extraPitch,
    receivedAt,
    messageId: message.id,
    userId: message.author.id,
  });
}
