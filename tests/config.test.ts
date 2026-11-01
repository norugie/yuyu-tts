import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../src/config.ts';

const ok = { DISCORD_TOKEN: 'abc.def.ghi', DISCORD_CLIENT_ID: '123456789012345678' };

test('missing DISCORD_TOKEN gives a clear error', () => {
  assert.throws(() => loadConfig({ DISCORD_CLIENT_ID: ok.DISCORD_CLIENT_ID }), (err: unknown) => {
    assert.ok(err instanceof ConfigError);
    assert.match(err.message, /DISCORD_TOKEN is not set/);
    return true;
  });
});

test('an empty value counts as missing, and all problems are listed at once', () => {
  assert.throws(() => loadConfig({ DISCORD_TOKEN: '', DISCORD_CLIENT_ID: '  ' }), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /DISCORD_TOKEN/);
    assert.match(err.message, /DISCORD_CLIENT_ID/);
    return true;
  });
});

test('defaults: no guild (global commands), local Kokoro, data/yuyu.db, info logs', () => {
  const c = loadConfig({ ...ok, DISCORD_GUILD_ID: '' });
  assert.equal(c.discordGuildId, undefined);
  assert.equal(c.kokoroUrl, 'http://localhost:8880');
  assert.equal(c.dbPath, 'data/yuyu.db');
  assert.equal(c.presetsPath, 'config/presets.json');
  assert.equal(c.logLevel, 'info');
});

test('test server id is kept when set, and must look like a Discord id', () => {
  assert.equal(loadConfig({ ...ok, DISCORD_GUILD_ID: '987654321098765432' }).discordGuildId, '987654321098765432');
  assert.throws(() => loadConfig({ ...ok, DISCORD_GUILD_ID: 'my server' }), /DISCORD_GUILD_ID/);
});

test('bad KOKORO_URL and LOG_LEVEL are rejected', () => {
  assert.throws(() => loadConfig({ ...ok, KOKORO_URL: 'not a url' }), /KOKORO_URL/);
  assert.throws(() => loadConfig({ ...ok, LOG_LEVEL: 'loud' }), /LOG_LEVEL/);
});

test('the error message never contains the token', () => {
  assert.throws(() => loadConfig({ DISCORD_TOKEN: 'super-secret-token' }), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.doesNotMatch(err.message, /super-secret-token/);
    return true;
  });
});
