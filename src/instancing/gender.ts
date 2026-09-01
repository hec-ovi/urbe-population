/**
 * Gender assignment: one draw against the sex ratio, keyed by npcId alone, so
 * a person's gender is the same whether they are instanced, a family stub or
 * a name on someone else's household.
 */

import { hash01 } from '../core/rng.js';
import type { Gender } from '../schemas/npc.js';

export function pickGender(seed: string | number, femaleShare: number, npcId: string): Gender {
  return hash01(seed, 'gender', npcId) < femaleShare ? 'female' : 'male';
}
