import { MessageFlags, type Interaction } from 'discord.js';
import { COMMANDS } from './commands/index.ts';
import { VOICE_PREVIEW_PREFIX, VOICE_SELECT_ID, onVoicePreview, onVoiceSelect } from './commands/voice.ts';
import type { BotContext } from './context.ts';

const byName = new Map(COMMANDS.map((c) => [c.data.name, c]));

export async function handleInteraction(interaction: Interaction, ctx: BotContext): Promise<void> {
  // All our commands are server-only; "cached" means discord.js has the server's data.
  if (!interaction.inCachedGuild()) return;
  try {
    if (interaction.isChatInputCommand()) {
      const command = byName.get(interaction.commandName);
      if (command === undefined) return;
      ctx.log.debug('command', { guild: interaction.guildId, user: interaction.user.id, command: interaction.commandName });
      await command.execute(interaction, ctx);
    } else if (interaction.isStringSelectMenu() && interaction.customId === VOICE_SELECT_ID) {
      await onVoiceSelect(interaction, ctx);
    } else if (interaction.isButton() && interaction.customId.startsWith(VOICE_PREVIEW_PREFIX)) {
      await onVoicePreview(interaction, ctx);
    }
  } catch (err) {
    ctx.log.error('interaction failed', { guild: interaction.guildId, err });
    if (!interaction.isRepliable()) return;
    const content = 'Oops, something went wrong. Try again?';
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch {
      // The interaction may have expired; nothing more to do.
    }
  }
}
