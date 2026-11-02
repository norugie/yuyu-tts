import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { NOT_IN_VOICE } from '../../voice/connection.ts';
import { readPlace, type Command } from './types.ts';

export const join: Command = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join your voice channel and start reading messages.')
    .setContexts(InteractionContextType.Guild)
    .toJSON(),

  async execute(interaction, ctx) {
    const channel = interaction.member.voice.channel;
    if (channel === null) {
      await interaction.reply({ content: NOT_IN_VOICE, flags: MessageFlags.Ephemeral });
      return;
    }
    if (ctx.sessions.get(interaction.guildId)?.channelId === channel.id) {
      await interaction.reply({ content: `I'm already in **${channel.name}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const me = interaction.guild.members.me;
    if (me !== null && !channel.permissionsFor(me).has(['ViewChannel', 'Connect', 'Speak'])) {
      await interaction.reply({ content: `I can't join **${channel.name}**: I need the Connect and Speak permissions there.`, flags: MessageFlags.Ephemeral });
      return;
    }
    // Joining can take a few seconds (DAVE handshake); Discord wants an answer within 3.
    await interaction.deferReply();
    try {
      await ctx.sessions.join(channel);
    } catch (err) {
      ctx.log.error('join failed', { guild: interaction.guildId, err });
      await interaction.editReply(`Couldn't connect to **${channel.name}**. Try again in a moment.`);
      return;
    }
    const where = readPlace(ctx.settings.getGuild(interaction.guildId).readChannelId);
    // Public on purpose, so everyone knows the bot's state.
    await interaction.editReply(`Joined **${channel.name}**! I'll read messages from ${where} ♪`);
  },
};

export const leave: Command = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Stop reading, clear the queue and leave voice.')
    .setContexts(InteractionContextType.Guild)
    .toJSON(),

  async execute(interaction, ctx) {
    const session = ctx.sessions.get(interaction.guildId);
    if (session === undefined) {
      await interaction.reply({ content: "I'm not in a voice channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    const name = interaction.guild.channels.cache.get(session.channelId)?.name ?? 'voice';
    ctx.sessions.leave(interaction.guildId);
    await interaction.reply(`Left **${name}**. Bye!`);
  },
};
