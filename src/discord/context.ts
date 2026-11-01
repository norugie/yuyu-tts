// Everything a command or event handler needs, passed in instead of imported, so tests can fake it.

import type { Logger } from '../log.ts';
import type { SettingsStore } from '../store/settings.ts';
import type { Presets } from '../tts/presets.ts';
import type { SpeechMaker } from '../tts/speech.ts';
import type { Sessions } from '../voice/connection.ts';

export type BotContext = {
  log: Logger;
  settings: SettingsStore;
  presets: Presets;
  sessions: Sessions;
  makeSpeech: SpeechMaker;
};
