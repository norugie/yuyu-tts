import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { SPOKEN_NAME_MAX, cleanSpokenName } from '../../store/settings.ts';
import { readPlace, type Command } from './types.ts';

export const tts: Command = {
  data: new SlashCommandBuilder()
    .setName('tts')
    .setDescription('Turn reading your messages out loud on or off (in this server).')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('on')
        .setDescription('Read my messages out loud in this server.')
        .addStringOption((o) =>
          o.setName('name').setDescription('What to call you when your messages are read, e.g. "Mika says, ..." (this server)').setMaxLength(SPOKEN_NAME_MAX),
        ),
    )
    .addSubcommand((s) => s.setName('off').setDescription('Stop reading my messages in this server.'))
    .toJSON(),

  async execute(interaction, ctx) {
    const on = interaction.options.getSubcommand() === 'on';
    ctx.settings.setOptIn(interaction.guildId, interaction.user.id, on);
    // Only change the nickname when one is given, so a plain /tts on keeps the old one.
    const rawName = on ? interaction.options.getString('name') : null;
    const name = rawName === null ? '' : cleanSpokenName(rawName);
    if (name !== '') ctx.settings.setSpokenName(interaction.guildId, interaction.user.id, name);
    const spoken = ctx.settings.getSpokenName(interaction.guildId, interaction.user.id) ?? interaction.member.displayName;
    const where = readPlace(ctx.settings.getGuild(interaction.guildId).readChannelId);
    const content = on
      ? `Okay! I'll read your messages in ${where} out loud as **${spoken}**.${ctx.sessions.get(interaction.guildId) ? '' : ' Use /join to bring me into voice.'}`
      : "Okay, I won't read your messages anymore.";
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  },
};
