import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, MIGRATIONS } from '../../src/store/db.ts';
import { cleanSpokenName, createSettingsStore, DEFAULT_GUILD, DEFAULT_USER } from '../../src/store/settings.ts';

const G1 = '100000000000000001';
const G2 = '100000000000000002';
const U = '200000000000000001';

test('AC2.1: /tts on is saved per server and /tts off reverses it', () => {
  const s = createSettingsStore(openDb(':memory:'));
  assert.equal(s.getMember(G1, U).optedIn, false);
  s.setOptIn(G1, U, true);
  assert.equal(s.getMember(G1, U).optedIn, true);
  // Turning it on in one server never turns it on in another.
  assert.equal(s.getMember(G2, U).optedIn, false);
  s.setOptIn(G1, U, false);
  assert.equal(s.getMember(G1, U).optedIn, false);
});

test('AC2.1: settings survive closing and reopening the database file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yuyu-'));
  try {
    const path = join(dir, 'sub', 'yuyu.db');
    const db1 = openDb(path);
    createSettingsStore(db1).setOptIn(G1, U, true);
    createSettingsStore(db1).setPreset(U, 'suzu');
    db1.close();
    const db2 = openDb(path);
    const s = createSettingsStore(db2);
    assert.equal(s.getMember(G1, U).optedIn, true);
    assert.equal(s.getUser(U).preset, 'suzu');
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migrations run once and record the version', () => {
  const db = openDb(':memory:');
  assert.equal((db.prepare('SELECT version FROM schema_version').get() as { version: number }).version, MIGRATIONS.length);
});

test('user settings: defaults, updates keep other fields, reset', () => {
  const s = createSettingsStore(openDb(':memory:'));
  assert.deepEqual(s.getUser(U), DEFAULT_USER);
  s.setPreset(U, 'ichigo');
  s.setSpeed(U, 1.25);
  s.setPitch(U, -2);
  assert.deepEqual(s.getUser(U), { preset: 'ichigo', speed: 1.25, pitch: -2 });
  s.resetUser(U);
  assert.deepEqual(s.getUser(U), DEFAULT_USER);
});

test('speed and pitch outside their ranges are rejected', () => {
  const s = createSettingsStore(openDb(':memory:'));
  assert.throws(() => s.setSpeed(U, 0.4), RangeError);
  assert.throws(() => s.setSpeed(U, 2.1), RangeError);
  assert.throws(() => s.setPitch(U, 4.5), RangeError);
  assert.throws(() => s.setPitch(U, Number.NaN), RangeError);
});

test('server settings: defaults and per-server updates', () => {
  const s = createSettingsStore(openDb(':memory:'));
  assert.deepEqual(s.getGuild(G1), DEFAULT_GUILD);
  s.setQueueMode(G1, 'newest');
  s.setReadChannel(G1, '300000000000000001');
  assert.deepEqual(s.getGuild(G1), { ...DEFAULT_GUILD, queueMode: 'newest', readChannelId: '300000000000000001' });
  assert.deepEqual(s.getGuild(G2), DEFAULT_GUILD);
  s.setReadChannel(G1, null);
  assert.equal(s.getGuild(G1).readChannelId, null);
});

test('/tts on name: the spoken nickname is per server and survives /tts off', () => {
  const s = createSettingsStore(openDb(':memory:'));
  assert.equal(s.getMember(G1, U).spokenName, null);
  s.setOptIn(G1, U, true);
  s.setSpokenName(G1, U, '  Mika   chan ');
  assert.equal(s.getMember(G1, U).spokenName, 'Mika chan');
  assert.equal(s.getMember(G2, U).spokenName, null);
  s.setOptIn(G1, U, false);
  assert.equal(s.getMember(G1, U).spokenName, 'Mika chan');
  assert.equal(s.getMember(G1, U).optedIn, false);
  s.setSpokenName(G1, U, null);
  assert.equal(s.getMember(G1, U).spokenName, null);
});

test('setting a nickname alone does not opt someone in', () => {
  const s = createSettingsStore(openDb(':memory:'));
  s.setSpokenName(G1, U, 'Rin');
  assert.equal(s.getMember(G1, U).optedIn, false);
});

test('nicknames are tidied and capped at 32 characters', () => {
  assert.equal(cleanSpokenName(' a  b '), 'a b');
  assert.equal(cleanSpokenName('x'.repeat(40)).length, 32);
});

test('migration 2 upgrades an existing version-1 database without losing data', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { migrate, MIGRATIONS } = await import('../../src/store/db.ts');
  const db = new Database(':memory:');
  db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL); INSERT INTO schema_version VALUES (1);');
  db.exec(MIGRATIONS[0]!);
  db.prepare("INSERT INTO guild_opt_in (guild_id, user_id, opted_in, updated_at) VALUES ('g', 'u', 1, 'now')").run();
  migrate(db);
  const s = createSettingsStore(db);
  assert.equal(s.getMember('g', 'u').optedIn, true);
  assert.equal(s.getMember('g', 'u').spokenName, null);
});

test('dictionary overrides are per server, lowercased, and can be cleared (AC8.3)', () => {
  const s = createSettingsStore(openDb(':memory:'));
  s.setDictWord('g1', ' OMW ', ' on my way now ');
  s.setDictWord('g1', 'ty', '');
  assert.deepEqual(s.getDictOverrides('g1'), [
    { word: 'omw', spoken: 'on my way now' },
    { word: 'ty', spoken: '' },
  ]);
  assert.deepEqual(s.getDictOverrides('g2'), []);
  s.clearDictWord('g1', 'OMW');
  assert.deepEqual(s.getDictOverrides('g1'), [{ word: 'ty', spoken: '' }]);
});
