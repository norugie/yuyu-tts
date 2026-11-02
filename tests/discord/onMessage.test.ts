import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideSpeak, decideText, withNamePrefix, type SpeakInput } from '../../src/discord/onMessage.ts';

const VC = '400000000000000001';
const TTS = '400000000000000002';
const base: SpeakInput = {
  authorIsBot: false,
  guildId: '100000000000000001',
  botVoiceChannelId: VC,
  messageChannelId: VC,
  readChannelId: null,
  authorOptedIn: true,
};

test('speaks an opted-in human in the voice channel chat', () => assert.deepEqual(decideSpeak(base), { speak: true }));
test('never speaks bots', () => assert.deepEqual(decideSpeak({ ...base, authorIsBot: true }), { speak: false, reason: 'bot-author' }));
test('never speaks users who are not opted in', () =>
  assert.deepEqual(decideSpeak({ ...base, authorOptedIn: false }), { speak: false, reason: 'not-opted-in' }));
test('skips messages that are empty after normalization', () => {
  assert.deepEqual(decideText('  '), { speak: false, reason: 'empty' });
  assert.deepEqual(decideText('left door'), { speak: true });
});
test('does nothing when the bot is not in voice, or in DMs', () => {
  assert.deepEqual(decideSpeak({ ...base, botVoiceChannelId: null }), { speak: false, reason: 'bot-not-in-voice' });
  assert.deepEqual(decideSpeak({ ...base, guildId: null }), { speak: false, reason: 'not-in-server' });
});
test('reads the voice chat by default, or only the /channel set channel', () => {
  assert.deepEqual(decideSpeak({ ...base, messageChannelId: TTS }), { speak: false, reason: 'wrong-channel' });
  assert.deepEqual(decideSpeak({ ...base, readChannelId: TTS, messageChannelId: TTS }), { speak: true });
  assert.deepEqual(decideSpeak({ ...base, readChannelId: TTS }), { speak: false, reason: 'wrong-channel' });
});

test('on-change prefixes the first message and then only when a different person speaks', () => {
  assert.equal(withNamePrefix('on-change', undefined, 'a', 'Mika', 'hi'), 'Mika says. Hi');
  assert.equal(withNamePrefix('on-change', 'a', 'a', 'Mika', 'again'), 'again');
  assert.equal(withNamePrefix('on-change', 'a', 'b', 'Rin', 'yo'), 'Rin says. Yo');
});
test('name prefix: always and never', () => {
  assert.equal(withNamePrefix('always', undefined, 'a', 'Mika', 'hi'), 'Mika says. Hi');
  assert.equal(withNamePrefix('never', 'a', 'b', 'Rin', 'yo'), 'yo');
});

test('the name is its own sentence, so a question or exclamation keeps its ending', () => {
  assert.equal(withNamePrefix('always', undefined, 'a', 'Big Mika', 'are you coming?'), 'Big Mika says. Are you coming?');
  assert.equal(withNamePrefix('always', undefined, 'a', 'Big Mika', 'run!'), 'Big Mika says. Run!');
  assert.equal(withNamePrefix('never', undefined, 'a', 'Big Mika', 'are you coming?'), 'are you coming?');
});
