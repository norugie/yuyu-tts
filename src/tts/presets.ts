// Loads and validates config/presets.json, and works out the final voice for a user:
// their preset (or the default) with their own speed and pitch applied on top.

import { readFileSync } from 'node:fs';
import { MAX_SEMITONES } from './audio.ts';
import { ProblemsError } from '../config.ts';
import type { UserSettings } from '../store/settings.ts';

export type Preset = {
  id: string;
  // Shown in Discord, e.g. "Yuzu".
  name: string;
  // Kokoro voice or blend, e.g. "af_nicole(1)+af_bella(1)".
  voice: string;
  // Semitones, ffmpeg asetrate (pitch and formants).
  pitch: number;
  // Semitones, ffmpeg rubberband (pitch only). 0 = off.
  extraPitch: number;
  // Kokoro speed. 1 = normal.
  speed: number;
};

export type Presets = {
  defaultId: string;
  // In file order, so menus list them the way the file does.
  list: Preset[];
  byId: Map<string, Preset>;
};

export class PresetError extends ProblemsError {
  constructor(problems: string[]) {
    super('config/presets.json has problems:', problems);
  }
}

const ID = /^[a-z0-9-]{1,32}$/;
// Kokoro voice ids look like af_bella; blends like af_bella(2)+af_sky(1).
const VOICE = /^[a-z]{2}_[a-z]+(\(\d+(\.\d+)?\))?(\+[a-z]{2}_[a-z]+(\(\d+(\.\d+)?\))?)*$/;

// Pure: validates the parsed JSON. Lists every problem at once.
export function parsePresets(json: unknown): Presets {
  const problems: string[] = [];
  if (typeof json !== 'object' || json === null) throw new PresetError(['the file must contain a JSON object']);
  const { default: defaultId, presets } = json as { default?: unknown; presets?: unknown };

  if (typeof presets !== 'object' || presets === null || Array.isArray(presets)) {
    throw new PresetError(['"presets" must be an object of id → preset']);
  }

  const list: Preset[] = [];
  for (const [id, raw] of Object.entries(presets)) {
    const where = `preset "${id}"`;
    if (!ID.test(id)) problems.push(`${where}: id must be lowercase letters, digits or dashes`);
    if (typeof raw !== 'object' || raw === null) {
      problems.push(`${where}: must be an object`);
      continue;
    }
    const p = raw as Record<string, unknown>;
    const num = (key: string, min: number, max: number, fallback?: number): number => {
      const v = p[key] ?? fallback;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
        problems.push(`${where}: "${key}" must be a number from ${min} to ${max}`);
        return 0;
      }
      return v;
    };
    if (typeof p.name !== 'string' || p.name.trim() === '' || p.name.length > 32) problems.push(`${where}: "name" must be text (1–32 characters)`);
    if (typeof p.voice !== 'string' || !VOICE.test(p.voice)) problems.push(`${where}: "voice" must be a Kokoro voice like "af_bella" or a blend like "af_bella(2)+af_sky(1)"`);
    list.push({
      id,
      name: typeof p.name === 'string' ? p.name.trim() : id,
      voice: typeof p.voice === 'string' ? p.voice : '',
      pitch: num('pitch', -MAX_SEMITONES, MAX_SEMITONES),
      extraPitch: num('extraPitch', -MAX_SEMITONES, MAX_SEMITONES, 0),
      speed: num('speed', 0.5, 2),
    });
  }

  if (list.length === 0) problems.push('there must be at least one preset');
  // Discord select menus and button rows have limits; 25 is the select menu maximum.
  if (list.length > 25) problems.push('at most 25 presets (Discord menu limit)');
  if (typeof defaultId !== 'string') problems.push('"default" must name one of the presets');
  else if (!list.some((p) => p.id === defaultId)) problems.push(`"default" is "${defaultId}", which is not a preset`);

  if (problems.length > 0) throw new PresetError(problems);
  return { defaultId: defaultId as string, list, byId: new Map(list.map((p) => [p.id, p])) };
}

export function loadPresets(path: string): Presets {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new PresetError([`could not read ${path}: ${err instanceof Error ? err.message : String(err)}`]);
  }
  return parsePresets(json);
}

export type VoiceChoice = {
  preset: Preset;
  voice: string;
  speed: number;
  semitones: number;
  extraPitch: number;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// Pure: AC5.3/AC5.4 + AC6.1/AC6.2. Unknown or missing preset → default (e.g. a preset was removed).
export function resolveVoice(presets: Presets, user: UserSettings): VoiceChoice {
  const preset = (user.preset !== null ? presets.byId.get(user.preset) : undefined) ?? presets.byId.get(presets.defaultId)!;
  return {
    preset,
    voice: preset.voice,
    // Kokoro accepts roughly 0.25–4; keep well inside that.
    speed: clamp(Math.round(preset.speed * user.speed * 100) / 100, 0.25, 3),
    semitones: clamp(preset.pitch + user.pitch, -MAX_SEMITONES, MAX_SEMITONES),
    extraPitch: preset.extraPitch,
  };
}
