import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { PITCH_RANGE, SPEED_RANGE, type UserSettings } from '../../store/settings.ts';
import { resolveVoice, type Presets } from '../../tts/presets.ts';
import { speechFor, speechToBuffer } from '../../tts/speech.ts';
import type { BotContext } from '../context.ts';
import type { Command } from './types.ts';

export const VOICE_SELECT_ID = 'voice:select';
export const VOICE_PREVIEW_PREFIX = 'voice:preview:';

// Each preview makes a full Kokoro + ffmpeg clip, so one per person every 5 s.
export const PREVIEW_COOLDOWN_MS = 5_000;

export function previewCooldownLeft(lastAt: number | undefined, now: number, cooldownMs: number = PREVIEW_COOLDOWN_MS): number {
  if (lastAt === undefined) return 0;
  return Math.max(0, lastAt + cooldownMs - now);
}

const lastPreviewAt = new Map<string, number>();

export const previewLine = (name: string) => `Hi, I'm ${name}! Who wants to do one more mission before we stop for the night?`;

// One preview button per preset, 5 per row (Discord's limit).
export function voiceMenu(presets: Presets, current: string) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(VOICE_SELECT_ID)
    .setPlaceholder('Choose your voice')
    .addOptions(
      presets.list.map((p) => ({
        label: p.name,
        value: p.id,
        description: p.id === presets.defaultId ? 'Default voice' : undefined,
        default: p.id === current,
      })),
    );
  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)];
  // Discord allows 5 rows; the select uses one, so at most 4 rows (20) of preview buttons.
  for (let i = 0; i < Math.min(presets.list.length, 20); i += 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        presets.list.slice(i, i + 5).map((p) => new ButtonBuilder().setCustomId(`${VOICE_PREVIEW_PREFIX}${p.id}`).setLabel(`Preview ${p.name}`).setStyle(ButtonStyle.Secondary)),
      ),
    );
  }
  return rows;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function describeSettings(presets: Presets, user: UserSettings, optedIn: boolean): string {
  const v = resolveVoice(presets, user);
  return [
    `Voice: **${v.preset.name}**${user.preset === null ? ' (default)' : ''}`,
    `Speed: **${user.speed}×**`,
    `Pitch: **${signed(user.pitch)}**`,
    `Reading my messages here: **${optedIn ? 'on' : 'off'}**`,
  ].join('\n');
}

export const voice: Command = {
  data: new SlashCommandBuilder().setName('voice').setDescription('Pick your voice, with previews.').setContexts(InteractionContextType.Guild).toJSON(),

  async execute(interaction, ctx) {
    const current = resolveVoice(ctx.presets, ctx.settings.getUser(interaction.user.id)).preset.id;
    await interaction.reply({
      content: 'Pick a voice, or press a button to hear it first.',
      components: voiceMenu(ctx.presets, current),
      flags: MessageFlags.Ephemeral,
    });
  },
};

export async function onVoiceSelect(interaction: StringSelectMenuInteraction<'cached'>, ctx: BotContext): Promise<void> {
  const id = interaction.values[0];
  const preset = id === undefined ? undefined : ctx.presets.byId.get(id);
  if (preset === undefined) {
    await interaction.reply({ content: "That voice doesn't exist anymore. Run /voice again.", flags: MessageFlags.Ephemeral });
    return;
  }
  ctx.settings.setPreset(interaction.user.id, preset.id);
  await interaction.update({ content: `Voice set to **${preset.name}**.`, components: voiceMenu(ctx.presets, preset.id) });
}

// Plays in voice if the bot is in a call here, otherwise sends the clip as a file.
export async function onVoicePreview(interaction: ButtonInteraction<'cached'>, ctx: BotContext): Promise<void> {
  const preset = ctx.presets.byId.get(interaction.customId.slice(VOICE_PREVIEW_PREFIX.length));
  if (preset === undefined) {
    await interaction.reply({ content: "That voice doesn't exist anymore. Run /voice again.", flags: MessageFlags.Ephemeral });
    return;
  }
  const now = Date.now();
  const wait = previewCooldownLeft(lastPreviewAt.get(interaction.user.id), now);
  if (wait > 0) {
    await interaction.reply({ content: `Wait a moment (${Math.ceil(wait / 1000)} s) before the next preview.`, flags: MessageFlags.Ephemeral });
    return;
  }
  lastPreviewAt.set(interaction.user.id, now);

  const user = ctx.settings.getUser(interaction.user.id);
  const v = resolveVoice(ctx.presets, { ...user, preset: preset.id });
  const item = speechFor(previewLine(preset.name), v);

  const session = ctx.sessions.get(interaction.guildId);
  if (session !== undefined) {
    session.queue.enqueue(item);
    await interaction.reply({ content: `Playing a preview of **${preset.name}** in voice.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const clip = await speechToBuffer(await ctx.makeSpeech(item));
    await interaction.editReply({ content: `Here's **${preset.name}**:`, files: [new AttachmentBuilder(clip, { name: `${preset.id}-preview.ogg` })] });
  } catch (err) {
    ctx.log.error('preview failed', { err });
    await interaction.editReply("Couldn't make the preview. Is Kokoro running?");
  }
}

export const speed: Command = {
  data: new SlashCommandBuilder()
    .setName('speed')
    .setDescription('Set how fast your messages are read (1 = normal).')
    .setContexts(InteractionContextType.Guild)
    .addNumberOption((o) => o.setName('value').setDescription(`${SPEED_RANGE.min} to ${SPEED_RANGE.max}`).setRequired(true).setMinValue(SPEED_RANGE.min).setMaxValue(SPEED_RANGE.max))
    .toJSON(),

  async execute(interaction, ctx) {
    const value = interaction.options.getNumber('value', true);
    try {
      ctx.settings.setSpeed(interaction.user.id, value);
    } catch {
      await interaction.reply({ content: `Speed has to be between ${SPEED_RANGE.min} and ${SPEED_RANGE.max}.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: `Speed set to **${value}×**.`, flags: MessageFlags.Ephemeral });
  },
};

export const pitch: Command = {
  data: new SlashCommandBuilder()
    .setName('pitch')
    .setDescription('Make your voice higher or lower, in semitones (0 = as the voice is).')
    .setContexts(InteractionContextType.Guild)
    .addNumberOption((o) => o.setName('value').setDescription(`${PITCH_RANGE.min} to +${PITCH_RANGE.max}`).setRequired(true).setMinValue(PITCH_RANGE.min).setMaxValue(PITCH_RANGE.max))
    .toJSON(),

  async execute(interaction, ctx) {
    const value = interaction.options.getNumber('value', true);
    try {
      ctx.settings.setPitch(interaction.user.id, value);
    } catch {
      await interaction.reply({ content: `Pitch has to be between ${PITCH_RANGE.min} and +${PITCH_RANGE.max}.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: `Pitch set to **${signed(value)}**.`, flags: MessageFlags.Ephemeral });
  },
};

export const settings: Command = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Show your voice settings.')
    .setContexts(InteractionContextType.Guild)
    .addBooleanOption((o) => o.setName('reset').setDescription('Reset voice, speed and pitch to the defaults.'))
    .toJSON(),

  async execute(interaction, ctx) {
    const reset = interaction.options.getBoolean('reset') ?? false;
    if (reset) ctx.settings.resetUser(interaction.user.id);
    const text = describeSettings(ctx.presets, ctx.settings.getUser(interaction.user.id), ctx.settings.getMember(interaction.guildId, interaction.user.id).optedIn);
    await interaction.reply({ content: reset ? `Settings reset.\n${text}` : text, flags: MessageFlags.Ephemeral });
  },
};
