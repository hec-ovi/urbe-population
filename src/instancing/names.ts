/** Name assignment: plain hash into the pool; repeats across NPCs by design. */

import { rand } from '../core/rng.js';
import type { NamePool } from '../schemas/npc-types.js';
import type { NPCName } from '../schemas/npc.js';

export function pickName(seed: string | number, pool: NamePool, npcId: string): NPCName {
  const r = rand(seed, 'name', npcId);
  return { given: r.pick(pool.given), family: r.pick(pool.family) };
}
