import { ChannelType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { NAME_PREFIX_MODES, QUEUE_MODES, type NamePrefixMode, type QueueMode } from '../../store/settings.ts';
import type { Command } from './types.ts';

export const skip: Command = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the message being read.')
    .setContexts(InteractionContextType.Guild)
    .addBooleanOption((o) => o.setName('all').setDescription('Also clear everything waiting.'))
    .toJSON(),

  async execute(interaction, ctx) {
    const session = ctx.sessions.get(interaction.guildId);
    if (session === undefined || !session.queue.isBusy) {
      await interaction.reply({ content: 'Nothing to skip.', flags: MessageFlags.Ephemeral });
      return;
    }
    const all = interaction.options.getBoolean('all') ?? false;
    if (all) session.queue.clear();
    else session.queue.skip();
    await interaction.reply({ content: all ? 'Skipped everything.' : 'Skipped.', flags: MessageFlags.Ephemeral });
  },
};

const MODE_TEXT: Record<QueueMode, string> = {
  'in-order': 'every message, in order',
  newest: 'only the newest waiting message',
};

export const queue: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('How to handle messages that pile up (this server).')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('in-order reads everything; newest skips to the latest message.')
        .setRequired(true)
        .addChoices(...QUEUE_MODES.map((m) => ({ name: m, value: m }))),
    )
    .toJSON(),

  async execute(interaction, ctx) {
    const mode = interaction.options.getString('mode', true) as QueueMode;
    ctx.settings.setQueueMode(interaction.guildId, mode);
    await interaction.reply({ content: `Queue mode set to **${mode}**: I'll read ${MODE_TEXT[mode]}.`, flags: MessageFlags.Ephemeral });
  },
};

export const channel: Command = {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Choose which text channel I read (this server).')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Read messages from this channel instead of the voice channel chat.')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('The channel to read').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((s) => s.setName('reset').setDescription("Go back to reading the voice channel's own chat."))
    .toJSON(),

  async execute(interaction, ctx) {
    if (interaction.options.getSubcommand() === 'reset') {
      ctx.settings.setReadChannel(interaction.guildId, null);
      await interaction.reply({ content: "Okay! I'll read the chat of the voice channel I'm in.", flags: MessageFlags.Ephemeral });
      return;
    }
    const target = interaction.options.getChannel('channel', true);
    const me = interaction.guild.members.me;
    const resolved = interaction.guild.channels.cache.get(target.id);
    if (me !== null && resolved !== undefined && !resolved.permissionsFor(me).has(['ViewChannel', 'ReadMessageHistory'])) {
      await interaction.reply({ content: `I can't see <#${target.id}>. Give me View Channel there first.`, flags: MessageFlags.Ephemeral });
      return;
    }
    ctx.settings.setReadChannel(interaction.guildId, target.id);
    await interaction.reply({ content: `Okay! I'll read messages from <#${target.id}>.`, flags: MessageFlags.Ephemeral });
  },
};

const PREFIX_TEXT: Record<NamePrefixMode, string> = {
  always: 'before every message',
  'on-change': 'when the speaker changes (and on the first message after I join)',
  never: 'never',
};

export const prefix: Command = {
  data: new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('When to say who is talking, e.g. "Mika says, ..." (this server).')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('always, on-change (default) or never')
        .setRequired(true)
        .addChoices(...NAME_PREFIX_MODES.map((m) => ({ name: m, value: m }))),
    )
    .toJSON(),

  async execute(interaction, ctx) {
    const mode = interaction.options.getString('mode', true) as NamePrefixMode;
    ctx.settings.setNamePrefix(interaction.guildId, mode);
    await interaction.reply({ content: `Okay! I'll say who's talking ${PREFIX_TEXT[mode]}.`, flags: MessageFlags.Ephemeral });
  },
};
