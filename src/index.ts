// Wiring only: read config, open the database, connect to Discord, hook up events.

import { generateDependencyReport } from '@discordjs/voice';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { ConfigError, loadConfig } from './config.ts';
import { createLogger } from './log.ts';
import { openDb } from './store/db.ts';
import { createSettingsStore } from './store/settings.ts';
import { createKokoroClient } from './tts/kokoro.ts';
import { loadPresets } from './tts/presets.ts';
import { createSpeechMaker } from './tts/speech.ts';
import { Sessions } from './voice/connection.ts';
import { handleInteraction } from './discord/interactions.ts';
import { handleMessage } from './discord/messages.ts';
import { registerCommands } from './discord/registerCommands.ts';
import type { BotContext } from './discord/context.ts';

let config;
try {
  config = loadConfig();
} catch (err) {
  // A plain message, not a stack trace: this is almost always a .env typo.
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}

const log = createLogger({ level: config.logLevel });
const presets = loadPresets(config.presetsPath);
const db = openDb(config.dbPath);
const settings = createSettingsStore(db);
const kokoro = createKokoroClient(config.kokoroUrl);
const makeSpeech = createSpeechMaker(kokoro);
const sessions = new Sessions({ makeSpeech, settings, log });
const ctx: BotContext = { log, settings, presets, sessions, makeSpeech };

// PRD AC1.5: shows which voice libraries were found, including the DAVE library (@snazzah/davey).
log.info('voice dependency report', { report: generateDependencyReport() });
log.info('presets loaded', { presets: presets.list.map((p) => p.id), default: presets.defaultId });
if (!(await kokoro.health())) log.warn('Kokoro is not answering yet; messages will fail until it is up', { url: config.kokoroUrl });

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once(Events.ClientReady, async (c) => {
  log.info('logged in', { user: c.user.tag, servers: c.guilds.cache.size });
  try {
    await registerCommands(config, log);
  } catch (err) {
    log.error('could not register slash commands', { err });
  }
});

client.on(Events.InteractionCreate, (interaction) => void handleInteraction(interaction, ctx));
client.on(Events.MessageCreate, (message) => {
  try {
    handleMessage(message, ctx);
  } catch (err) {
    log.error('message handling failed', { err });
  }
});
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const guild = newState.guild ?? oldState.guild;
  if (client.user !== null) sessions.onVoiceStateChange(guild, client.user.id);
});
client.on(Events.Error, (err) => log.error('discord client error', { err }));

// `docker compose down` sends SIGTERM: leave voice cleanly and close the database.
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info('shutting down', { signal });
  sessions.destroyAll();
  await client.destroy();
  db.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await client.login(config.discordToken);
} catch (err) {
  // Wrong token, no internet, or the Message Content intent is off in the Developer Portal.
  log.error('could not log in to Discord (check DISCORD_TOKEN and the Message Content intent)', { err });
  db.close();
  process.exit(1);
}
