// Phase 5 (task 5.3): /dict add | remove | list. Words to say differently in this server (PRD F8, AC8.3).
// Anyone can change it, like the other server settings.

import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { cleanWord, dictEntryError, DICT_SPOKEN_MAX, DICT_WORD_MAX, mergeDictionary, type DictEntries, type DictOverride } from '../../text/dictionary.ts';
import type { Command } from './types.ts';

// Discord replies are capped at 2000 characters.
const REPLY_MAX = 1900;

// Pure: what /dict remove should do with a word.
//  'switch-off' = it's a default word: keep a "don't replace" row for this server.
//  'delete'     = only this server added it: drop the row.
//  'missing'    = not in this server's dictionary at all.
export function removeAction(defaults: DictEntries, overrides: readonly DictOverride[], word: string): 'switch-off' | 'delete' | 'missing' {
  const w = cleanWord(word);
  if (!mergeDictionary(defaults, overrides).has(w)) return 'missing';
  return defaults.has(w) ? 'switch-off' : 'delete';
}

// Pure: the /dict list reply, sorted, cut to fit one Discord message.
export function describeDictionary(entries: DictEntries): string {
  if (entries.size === 0) return 'The dictionary is empty. Add a word with `/dict add`.';
  const lines = [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([w, s]) => `**${w}** → ${s}`);
  let out = `Words I say differently here (${entries.size}):`;
  for (const [i, line] of lines.entries()) {
    if (out.length + line.length + 1 > REPLY_MAX) return `${out}\n…and ${lines.length - i} more.`;
    out += `\n${line}`;
  }
  return out;
}

export const dict: Command = {
  data: new SlashCommandBuilder()
    .setName('dict')
    .setDescription('Words I should say differently (this server).')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Say a word a different way, e.g. omw → on my way.')
        .addStringOption((o) => o.setName('word').setDescription('The word as people type it').setRequired(true).setMaxLength(DICT_WORD_MAX))
        .addStringOption((o) => o.setName('say').setDescription('How I should say it').setRequired(true).setMaxLength(DICT_SPOKEN_MAX)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Stop replacing a word.')
        .addStringOption((o) => o.setName('word').setDescription('The word to stop replacing').setRequired(true).setMaxLength(DICT_WORD_MAX)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('Show every word I replace here.'))
    .toJSON(),

  async execute(interaction, ctx) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      await interaction.reply({ content: describeDictionary(ctx.dictionaries.get(guildId)), flags: MessageFlags.Ephemeral });
      return;
    }

    const word = cleanWord(interaction.options.getString('word', true));

    if (sub === 'add') {
      const say = interaction.options.getString('say', true).trim();
      const error = dictEntryError(word, say);
      if (error !== null) {
        await interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
        return;
      }
      ctx.settings.setDictWord(guildId, word, say);
      ctx.dictionaries.invalidate(guildId);
      await interaction.reply({ content: `Got it! I'll say **${word}** as "${say}".`, flags: MessageFlags.Ephemeral });
      return;
    }

    // remove
    const action = removeAction(ctx.dictionary, ctx.settings.getDictOverrides(guildId), word);
    if (action === 'missing') {
      await interaction.reply({ content: `**${word}** isn't in the dictionary. See \`/dict list\`.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'switch-off') ctx.settings.setDictWord(guildId, word, '');
    else ctx.settings.clearDictWord(guildId, word);
    ctx.dictionaries.invalidate(guildId);
    await interaction.reply({ content: `Okay, I'll read **${word}** as it's written.`, flags: MessageFlags.Ephemeral });
  },
};
