export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Config = {
  discordToken: string;
  discordClientId: string;
  // Optional test server. Set: commands register to that server only (instant). Unset: global.
  discordGuildId: string | undefined;
  kokoroUrl: string;
  dbPath: string;
  presetsPath: string;
  dictionaryPath: string;
  ffmpegPath: string;
  logLevel: LogLevel;
};

// Lists every problem at once, so a bad file is fixed in one go.
export class ProblemsError extends Error {
  readonly problems: readonly string[];

  constructor(heading: string, problems: string[]) {
    super(`${heading}\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = new.target.name;
    this.problems = problems;
  }
}

export class ConfigError extends ProblemsError {
  constructor(problems: string[]) {
    super('Config problems (check your .env):', problems);
  }
}

// Discord ids ("snowflakes") are 17–20 digit numbers.
const SNOWFLAKE = /^\d{17,20}$/;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const problems: string[] = [];
  // Treat "KEY=" (empty) the same as missing, since that's what .env.example leaves behind.
  const get = (key: string): string | undefined => {
    const v = env[key]?.trim();
    return v === undefined || v === '' ? undefined : v;
  };

  const discordToken = get('DISCORD_TOKEN');
  if (discordToken === undefined) problems.push('DISCORD_TOKEN is not set (Developer Portal > Bot > Reset Token).');

  const discordClientId = get('DISCORD_CLIENT_ID');
  if (discordClientId === undefined) problems.push('DISCORD_CLIENT_ID is not set (Developer Portal > General Information > Application ID).');
  else if (!SNOWFLAKE.test(discordClientId)) problems.push('DISCORD_CLIENT_ID should be a long number (the Application ID).');

  const discordGuildId = get('DISCORD_GUILD_ID');
  if (discordGuildId !== undefined && !SNOWFLAKE.test(discordGuildId)) {
    problems.push('DISCORD_GUILD_ID should be a long number (right-click the server > Copy Server ID), or left empty.');
  }

  const kokoroUrl = get('KOKORO_URL') ?? 'http://localhost:8880';
  if (!URL.canParse(kokoroUrl)) problems.push(`KOKORO_URL is not a valid URL: ${kokoroUrl}`);

  const logLevel = (get('LOG_LEVEL') ?? 'info').toLowerCase();
  if (!(LOG_LEVELS as readonly string[]).includes(logLevel)) problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}.`);

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    discordToken: discordToken!,
    discordClientId: discordClientId!,
    discordGuildId,
    kokoroUrl,
    dbPath: get('DB_PATH') ?? 'data/yuyu.db',
    presetsPath: get('PRESETS_PATH') ?? 'config/presets.json',
    dictionaryPath: get('DICTIONARY_PATH') ?? 'config/dictionary.json',
    ffmpegPath: get('FFMPEG_PATH') ?? 'ffmpeg',
    logLevel: logLevel as LogLevel,
  };
}
