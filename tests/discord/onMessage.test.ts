import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideSpeak, withNamePrefix, type SpeakInput } from '../../src/discord/onMessage.ts';

const VC = '400000000000000001';
const TTS = '400000000000000002';
const base: SpeakInput = {
  authorIsBot: false,
  guildId: '100000000000000001',
  botVoiceChannelId: VC,
  messageChannelId: VC,
  readChannelId: null,
  authorOptedIn: true,
  text: 'left door',
};

test('speaks an opted-in human in the voice channel chat', () => assert.deepEqual(decideSpeak(base), { speak: true }));
test('AC2.4: never speaks bots', () => assert.deepEqual(decideSpeak({ ...base, authorIsBot: true }), { speak: false, reason: 'bot-author' }));
test('AC2.3: never speaks users who are not opted in', () =>
  assert.deepEqual(decideSpeak({ ...base, authorOptedIn: false }), { speak: false, reason: 'not-opted-in' }));
test('AC2.5: skips empty messages', () => assert.deepEqual(decideSpeak({ ...base, text: '  ' }), { speak: false, reason: 'empty' }));
test('does nothing when the bot is not in voice, or in DMs', () => {
  assert.deepEqual(decideSpeak({ ...base, botVoiceChannelId: null }), { speak: false, reason: 'bot-not-in-voice' });
  assert.deepEqual(decideSpeak({ ...base, guildId: null }), { speak: false, reason: 'not-in-server' });
});
test('AC2.7: reads the voice chat by default, or only the /channel set channel', () => {
  assert.deepEqual(decideSpeak({ ...base, messageChannelId: TTS }), { speak: false, reason: 'wrong-channel' });
  assert.deepEqual(decideSpeak({ ...base, readChannelId: TTS, messageChannelId: TTS }), { speak: true });
  assert.deepEqual(decideSpeak({ ...base, readChannelId: TTS }), { speak: false, reason: 'wrong-channel' });
});

test('AC2.6: on-change prefixes the first message and then only when a different person speaks', () => {
  assert.equal(withNamePrefix('on-change', undefined, 'a', 'Mika', 'hi'), 'Mika says, hi');
  assert.equal(withNamePrefix('on-change', 'a', 'a', 'Mika', 'again'), 'again');
  assert.equal(withNamePrefix('on-change', 'a', 'b', 'Rin', 'yo'), 'Rin says, yo');
});
test('AC2.6: always and never', () => {
  assert.equal(withNamePrefix('always', undefined, 'a', 'Mika', 'hi'), 'Mika says, hi');
  assert.equal(withNamePrefix('never', 'a', 'b', 'Rin', 'yo'), 'yo');
});
