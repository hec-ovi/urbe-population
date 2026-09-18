/**
 * Person facts drawn once per identity: an age inside the plausible range of
 * the type's category, and two to four plain traits from that category's
 * pool. Both are pure functions of the world seed and the NPC id.
 */

import { rand } from '../core/rng.js';
import type { NPCCategory } from '../schemas/npc-types.js';

/** Every NPC category, plus the children who live in the households. */
export type PersonaKind = NPCCategory | 'child';

/** Plausible working and living age spans, years. */
const AGE_RANGE: Record<PersonaKind, [min: number, max: number]> = {
  resident: [18, 84],
  worker: [18, 67],
  vendor: [18, 65],
  authority: [21, 60],
  transit: [21, 63],
  street: [18, 70],
  child: [1, 17],
};

const TRAIT_POOL: Record<PersonaKind, readonly string[]> = {
  resident: ['quiet', 'warm', 'curious', 'frugal', 'chatty', 'patient', 'proud', 'restless', 'kind', 'stubborn'],
  worker: ['punctual', 'methodical', 'ambitious', 'helpful', 'blunt', 'precise', 'dependable', 'tired', 'dry', 'guarded'],
  vendor: ['chatty', 'quick', 'friendly', 'sharp', 'patient', 'loud', 'generous', 'watchful'],
  authority: ['stern', 'watchful', 'calm', 'fair', 'suspicious', 'steady', 'brusque', 'protective'],
  transit: ['punctual', 'talkative', 'weathered', 'patient', 'gruff', 'steady', 'alert', 'helpful'],
  street: ['restless', 'streetwise', 'loud', 'wary', 'cheerful', 'scrappy', 'observant', 'open'],
  child: ['playful', 'shy', 'noisy', 'curious', 'stubborn', 'bright', 'clumsy', 'sweet'],
};

const MIN_TRAITS = 2;
const TRAIT_SPREAD = 3;

/** Two uniform draws averaged: whole years, common in the middle of the range. */
export function ageOf(seed: string | number, npcId: string, kind: PersonaKind): number {
  const [min, max] = AGE_RANGE[kind];
  const r = rand(seed, 'age', npcId);
  return min + Math.round(((r.next() + r.next()) / 2) * (max - min));
}

/** Two to four distinct traits, in draw order. */
export function traitsOf(seed: string | number, npcId: string, kind: PersonaKind): string[] {
  const pool = TRAIT_POOL[kind];
  const r = rand(seed, 'traits', npcId);
  const count = MIN_TRAITS + r.int(TRAIT_SPREAD);
  const traits: string[] = [];
  while (traits.length < count) {
    const trait = r.pick(pool);
    if (!traits.includes(trait)) traits.push(trait);
  }
  return traits;
}
