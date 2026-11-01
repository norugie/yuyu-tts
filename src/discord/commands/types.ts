import type { ChatInputCommandInteraction, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { BotContext } from '../context.ts';

export type Command = {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute(interaction: ChatInputCommandInteraction<'cached'>, ctx: BotContext): Promise<void>;
};

// "the voice channel chat" or "#tts", for replies.
export function readPlace(readChannelId: string | null): string {
  return readChannelId === null ? "the voice channel's chat" : `<#${readChannelId}>`;
}
