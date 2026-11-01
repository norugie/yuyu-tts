// One JSON object per line on stdout. Easy to read in `docker compose logs`, and easy for the
// latency eval (E1) to parse later: message timing fields like t_received / t_playing go in `fields`.

import { LOG_LEVELS, type LogLevel } from './config.ts';

export type Fields = Record<string, unknown>;

export type Logger = {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  // A logger that adds the same fields to every line (e.g. { guild: '123' }).
  child(fields: Fields): Logger;
};

export type LoggerOptions = {
  level?: LogLevel;
  // Where lines go. Tests pass an array push; the bot uses stdout.
  write?: (line: string) => void;
  now?: () => Date;
};

// Never let a secret end up in a log line, even by accident.
const SECRET_KEY = /token|secret|password|authorization/i;

function clean(value: unknown, key = ''): unknown {
  if (SECRET_KEY.test(key)) return '[redacted]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message, ...(value.stack ? { stack: value.stack.split('\n').slice(0, 6).join('\n') } : {}) };
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export function createLogger(opts: LoggerOptions = {}, base: Fields = {}): Logger {
  const minRank = LOG_LEVELS.indexOf(opts.level ?? 'info');
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = opts.now ?? (() => new Date());

  const log = (level: LogLevel) => (msg: string, fields: Fields = {}) => {
    if (LOG_LEVELS.indexOf(level) < minRank) return;
    const entry: Fields = { t: now().toISOString(), level, msg };
    for (const [k, v] of Object.entries({ ...base, ...fields })) entry[k] = clean(v, k);
    write(JSON.stringify(entry));
  };

  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: (fields) => createLogger(opts, { ...base, ...fields }),
  };
}
