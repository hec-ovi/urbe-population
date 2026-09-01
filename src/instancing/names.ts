/** Name assignment: plain hash into the pool the NPC's gender can draw from; repeats across NPCs by design. */

import { rand } from '../core/rng.js';
import type { ResolvedPool } from './name-pool.js';
import type { Gender, NPCName } from '../schemas/npc.js';

export function pickName(seed: string | number, pool: ResolvedPool, npcId: string, gender: Gender): NPCName {
  const r = rand(seed, 'name', npcId);
  return { given: r.pick(pool.given[gender]), family: r.pick(pool.family) };
}
