import type { Command } from './types.ts';
import { join, leave } from './join.ts';
import { tts } from './tts.ts';
import { channel, prefix, queue, skip } from './queue.ts';
import { pitch, settings, speed, voice } from './voice.ts';

export const COMMANDS: readonly Command[] = [join, leave, tts, skip, queue, prefix, channel, voice, speed, pitch, settings];
