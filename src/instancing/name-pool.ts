/**
 * Reads naming's given-name pool into one drawable list per gender: the
 * gender's own bucket, else neutral, else the flat union. An untagged pool
 * has no buckets, so everyone draws the whole list.
 */

import type { NamePool } from '../schemas/npc-types.js';
import type { Gender } from '../schemas/npc.js';

export interface ResolvedPool {
  /** Given names a person of this gender can carry. */
  given: Record<Gender, string[]>;
  family: string[];
  /** Lowercased names per bucket, for reading a fixed name's gender back. */
  buckets: Record<'male' | 'female' | 'neutral', Set<string>>;
}

export function resolvePool(pool: NamePool): ResolvedPool {
  const by = pool.givenByGender;
  const neutral = by?.neutral ?? [];
  const draw = (own: string[]): string[] => {
    if (own.length > 0) return own;
    return neutral.length > 0 ? neutral : pool.given;
  };
  return {
    given: { male: draw(by?.male ?? []), female: draw(by?.female ?? []) },
    family: pool.family,
    buckets: {
      male: lowerSet(by?.male),
      female: lowerSet(by?.female),
      neutral: lowerSet(by?.neutral),
    },
  };
}

/** The gender a fixed given name implies: only when one bucket claims it. */
export function inferGender(pool: ResolvedPool, given: string): Gender | undefined {
  const name = given.toLowerCase();
  if (pool.buckets.neutral.has(name)) return undefined;
  const male = pool.buckets.male.has(name);
  const female = pool.buckets.female.has(name);
  if (male && !female) return 'male';
  if (female && !male) return 'female';
  return undefined;
}

function lowerSet(names: string[] | undefined): Set<string> {
  return new Set((names ?? []).map((n) => n.toLowerCase()));
}
