// Runs automatically when the bot starts, or by hand:
// `npm run register` (add `-- --clear-guild <id>` to remove a test server's copies).
//
// DISCORD_GUILD_ID set   → commands go to that one test server only and update instantly.
// DISCORD_GUILD_ID empty → commands are global and work in every server the bot is in.
// Moving from test to global? Clear the test server's copies once, or they show up twice there.

import { REST, Routes } from 'discord.js';
import { pathToFileURL } from 'node:url';
import { loadConfig, type Config } from '../config.ts';
import { createLogger, type Logger } from '../log.ts';
import { COMMANDS } from './commands/index.ts';

export async function registerCommands(config: Config, log: Logger): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const body = COMMANDS.map((c) => c.data);
  if (config.discordGuildId !== undefined) {
    await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), { body });
    log.info('registered commands for the test server', { guild: config.discordGuildId, count: body.length });
  } else {
    await rest.put(Routes.applicationCommands(config.discordClientId), { body });
    log.info('registered global commands (new ones can take a while to show up)', { count: body.length });
  }
}

export async function clearGuildCommands(config: Config, guildId: string, log: Logger): Promise<void> {
  await new REST().setToken(config.discordToken).put(Routes.applicationGuildCommands(config.discordClientId, guildId), { body: [] });
  log.info('cleared test server commands', { guild: guildId });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const config = loadConfig();
  const log = createLogger({ level: config.logLevel });
  const i = process.argv.indexOf('--clear-guild');
  const task = i === -1 ? registerCommands(config, log) : clearGuildCommands(config, process.argv[i + 1] ?? '', log);
  task.catch((err: unknown) => {
    log.error('command registration failed', { err });
    process.exitCode = 1;
  });
}
