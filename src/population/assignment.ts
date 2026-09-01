/**
 * Deterministic attribute assignment: employment, job slot, home unit, NPC
 * type and role are pure functions of the identity indices, via event-keyed
 * hashes and Feistel bijections. Instantiation and aggregate statistics both
 * read this model, so they can never disagree.
 */

import { Permutation } from '../core/feistel.js';
import { rand } from '../core/rng.js';
import { isSecuritySlot, shiftForSlot } from './jobs.js';
import type { ResolvedParams } from './defaults.js';
import type { Demographics } from './demographics.js';
import type { WorldModel, Workplace } from '../world/model.js';
import type { NPCTypeDef, NPCTypeSet } from '../schemas/npc-types.js';
import type { ParcelType, WealthTier } from '../schemas/blueprint.js';
import type { Shift } from '../schemas/npc.js';

export interface JobAssignment {
  workplace: Workplace;
  localSlot: number;
  globalSlot: number;
  role: string;
  shift: Shift;
}

const VENDOR_PARCELS: ParcelType[] = ['commerce', 'mall', 'restaurant', 'coffee_shop', 'hotel'];
const AUTHORITY_PARCELS: ParcelType[] = ['police', 'military'];

const DERIVED_ROLE: Partial<Record<ParcelType, string>> = {
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

export class AssignmentModel {
  private readonly employedPerm: Permutation;
  private readonly jobPerm: Permutation;
  readonly totalEmployed: number;

  constructor(
    private readonly seed: string | number,
    private readonly world: WorldModel,
    private readonly demo: Demographics,
    private readonly typeSet: NPCTypeSet,
    params: ResolvedParams,
  ) {
    const target = Math.round(demo.totalAdults * params.laborForceParticipation * (1 - params.unemploymentRate));
    this.totalEmployed = Math.min(target, world.totalJobSlots);
    this.employedPerm = new Permutation(Math.max(1, demo.totalAdults), `${seed}|emp`);
    this.jobPerm = new Permutation(Math.max(1, world.totalJobSlots), `${seed}|job`);
  }

  isEmployed(adultIdx: number): boolean {
    return this.employedPerm.forward(adultIdx) < this.totalEmployed;
  }

  jobOfAdult(adultIdx: number): JobAssignment | undefined {
    const rank = this.employedPerm.forward(adultIdx);
    if (rank >= this.totalEmployed) return undefined;
    return this.jobOfSlot(this.jobPerm.forward(rank));
  }

  jobOfSlot(globalSlot: number): JobAssignment {
    const workplaces = this.world.workplaces;
    let lo = 0;
    let hi = workplaces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (workplaces[mid]!.slotOffset <= globalSlot) lo = mid;
      else hi = mid - 1;
    }
    const workplace = workplaces[lo]!;
    const localSlot = globalSlot - workplace.slotOffset;
    return {
      workplace,
      localSlot,
      globalSlot,
      role: this.roleOfSlot(workplace, localSlot),
      shift: shiftForSlot(this.seed, workplace.parcelId, workplace.staffing, localSlot),
    };
  }

  /** Which adult fills a job slot; undefined when the slot is unfilled. */
  adultOfSlot(globalSlot: number): number | undefined {
    const rank = this.jobPerm.inverse(globalSlot);
    if (rank >= this.totalEmployed) return undefined;
    return this.employedPerm.inverse(rank);
  }

  roleOfSlot(workplace: Workplace, localSlot: number): string {
    if (isSecuritySlot(workplace.staffing, localSlot)) return 'security';
    const support = this.world.interiors.get(workplace.parcelId);
    if (support) {
      const counts: number[] = [];
      let total = 0;
      for (const slot of support.roles) {
        const [min, max] = slot.count;
        const n = min + rand(this.seed, 'rolecount', workplace.parcelId, slot.id).int(max - min + 1);
        counts.push(n);
        total += n;
      }
      if (total > 0) {
        let cursor = localSlot % total;
        for (let i = 0; i < support.roles.length; i++) {
          if (cursor < counts[i]!) return support.roles[i]!.role;
          cursor -= counts[i]!;
        }
      }
    }
    return DERIVED_ROLE[workplace.type] ?? 'worker';
  }

  /** Themed NPC type: job-grounded for employed adults, resident type otherwise. */
  typeOfAdult(adultIdx: number): NPCTypeDef {
    const job = this.jobOfAdult(adultIdx);
    if (job) {
      const candidates = this.workerTypeCandidates(job.workplace.type, job.workplace.tier, job.role);
      const r = rand(this.seed, 'wtype', job.globalSlot);
      return candidates[r.weighted(candidates.map((t) => t.weight))]!;
    }
    const { groupIdx } = this.demo.locateAdult(adultIdx);
    const tier = this.world.groups[groupIdx]!.tier;
    const candidates = this.residentTypeCandidates(tier);
    const r = rand(this.seed, 'rtype', adultIdx);
    return candidates[r.weighted(candidates.map((t) => t.weight))]!;
  }

  private workerTypeCandidates(parcelType: ParcelType, tier: WealthTier, role: string): NPCTypeDef[] {
    const preferred = role === 'security' || AUTHORITY_PARCELS.includes(parcelType)
      ? 'authority'
      : VENDOR_PARCELS.includes(parcelType)
        ? 'vendor'
        : 'worker';
    const matches = (t: NPCTypeDef, category: string): boolean =>
      t.category === category &&
      (!t.grounding.parcelTypes || t.grounding.parcelTypes.includes(parcelType)) &&
      (!t.grounding.tiers || t.grounding.tiers.includes(tier));
    let candidates = this.typeSet.types.filter((t) => matches(t, preferred));
    if (candidates.length === 0) {
      candidates = this.typeSet.types.filter(
        (t) => ['worker', 'vendor', 'authority', 'transit'].includes(t.category) && (!t.grounding.parcelTypes || t.grounding.parcelTypes.includes(parcelType)),
      );
    }
    if (candidates.length === 0) candidates = this.typeSet.types.filter((t) => t.category === 'worker');
    if (candidates.length === 0) candidates = this.typeSet.types;
    return candidates;
  }

  residentTypeCandidates(tier: WealthTier): NPCTypeDef[] {
    let candidates = this.typeSet.types.filter(
      (t) => t.category === 'resident' && (!t.grounding.tiers || t.grounding.tiers.includes(tier)),
    );
    if (candidates.length === 0) candidates = this.typeSet.types.filter((t) => t.category === 'resident');
    if (candidates.length === 0) candidates = this.typeSet.types;
    return candidates;
  }

  /** Home of a household: Feistel-unique unit within the group. */
  homeOf(groupIdx: number, h: number): { parcelId: string; unit: number } {
    const group = this.world.groups[groupIdx]!;
    const perm = new Permutation(Math.max(1, group.totalUnits), `${this.seed}|home|${groupIdx}`);
    const unitIdx = perm.forward(h);
    let lo = 0;
    let hi = group.blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (group.blocks[mid]!.unitOffset <= unitIdx) lo = mid;
      else hi = mid - 1;
    }
    const block = group.blocks[lo]!;
    return { parcelId: block.parcelId, unit: unitIdx - block.unitOffset };
  }
}
