/**
 * Which NPC type categories may hold which job role, and the candidate ladder
 * that picks a worker's type for a post. A post's role decides the categories
 * that admit it, in preference order, so the person behind a counter is a
 * counter person and never a crane operator with a coffee machine.
 */

import type { NPCCategory, NPCTypeDef } from '../schemas/npc-types.js';
import type { ParcelType, WealthTier } from '../schemas/blueprint.js';

/** The role a workplace fills when no interior names its posts. */
export const DERIVED_ROLE: Partial<Record<ParcelType, string>> = {
  coffee_shop: 'barista',
  restaurant: 'waiter',
  commerce: 'vendor',
  mall: 'vendor',
  hotel: 'receptionist',
  offices: 'office_worker',
  corpo: 'office_worker',
  hospital: 'medic',
  clinic: 'medic',
  police: 'officer',
  military: 'guard',
  factory: 'operator',
};

/** Categories that admit a role, best first. Covers the interior role table and the derived roles. */
const ROLE_CATEGORIES: Record<string, NPCCategory[]> = {
  vendor: ['vendor'],
  barista: ['vendor', 'worker'],
  waiter: ['vendor', 'worker'],
  cook: ['vendor', 'worker'],
  receptionist: ['vendor', 'worker'],
  security: ['authority', 'worker'],
  officer: ['authority'],
  guard: ['authority', 'worker'],
  office_worker: ['worker'],
  executive: ['worker'],
  medic: ['worker'],
  operator: ['worker'],
  trainer: ['worker'],
  cleaner: ['worker'],
  worker: ['worker'],
  resident: ['resident', 'worker'],
  guest: ['resident', 'worker'],
};

const DEFAULT_CATEGORIES: NPCCategory[] = ['worker', 'vendor'];

/** Categories that hold a job at all. */
const EMPLOYABLE: NPCCategory[] = ['worker', 'vendor', 'authority', 'transit'];

export interface Post {
  parcelType: ParcelType;
  tier: WealthTier;
  role: string;
}

export function categoriesForRole(role: string): NPCCategory[] {
  return ROLE_CATEGORIES[role] ?? DEFAULT_CATEGORIES;
}

/** Whether the set holds any type of a category that admits this role. */
export function admitsRole(types: NPCTypeDef[], role: string): boolean {
  const admitted = categoriesForRole(role);
  return types.some((t) => admitted.includes(t.category));
}

/**
 * Types that may fill a post, most specific first: an admitting category
 * grounded on the parcel and its tier, then on the parcel, then anywhere.
 * Only a set with no admitting type at all reaches the last rungs, and
 * populationStats().typeGaps names those roles.
 */
export function postCandidates(types: NPCTypeDef[], post: Post): NPCTypeDef[] {
  const admitted = categoriesForRole(post.role);
  const admits = (t: NPCTypeDef): boolean => admitted.includes(t.category);
  const employable = (t: NPCTypeDef): boolean => EMPLOYABLE.includes(t.category);
  const onParcel = (t: NPCTypeDef): boolean => !t.grounding.parcelTypes || t.grounding.parcelTypes.includes(post.parcelType);
  const onTier = (t: NPCTypeDef): boolean => !t.grounding.tiers || t.grounding.tiers.includes(post.tier);
  const rungs: ((t: NPCTypeDef) => boolean)[] = [
    (t) => admits(t) && onParcel(t) && onTier(t),
    (t) => admits(t) && onParcel(t),
    admits,
    (t) => employable(t) && onParcel(t) && onTier(t),
    (t) => employable(t) && onParcel(t),
    employable,
  ];
  for (const rung of rungs) {
    const found = types.filter(rung);
    if (found.length > 0) return bestCategory(found, admitted);
  }
  return types;
}

/** Within a rung, the earliest admitting category present takes the post. */
function bestCategory(found: NPCTypeDef[], admitted: NPCCategory[]): NPCTypeDef[] {
  for (const category of admitted) {
    const best = found.filter((t) => t.category === category);
    if (best.length > 0) return best;
  }
  return found;
}
