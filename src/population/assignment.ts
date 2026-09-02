/**
 * Deterministic attribute assignment: employment, job slot, home unit, NPC
 * type and role are pure functions of the identity indices, via event-keyed
 * hashes and Feistel bijections. Instantiation and aggregate statistics both
 * read this model, so they can never disagree.
 */

import { Permutation } from '../core/feistel.js';
import { lastAtMost } from '../core/search.js';
import { rand } from '../core/rng.js';
import { chosenRoleCounts, isSecuritySlot, postOfSlot, shiftForSlot } from './jobs.js';
import { admitsRole, DERIVED_ROLE, postCandidates } from './role-types.js';
import { SlotOrder } from './slots.js';
import type { ResolvedParams } from './defaults.js';
import type { Demographics } from './demographics.js';
import type { WorldModel, Workplace } from '../world/model.js';
import type { NPCTypeDef, NPCTypeSet } from '../schemas/npc-types.js';
import type { WealthTier } from '../schemas/blueprint.js';
import type { Shift } from '../schemas/npc.js';

export interface JobAssignment {
  workplace: Workplace;
  localSlot: number;
  globalSlot: number;
  role: string;
  shift: Shift;
}

export class AssignmentModel {
  private readonly employedPerm: Permutation;
  private readonly slotOrder: SlotOrder;
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
    this.slotOrder = new SlotOrder(world.workplaces.map((w) => w.staffing.slotCount));
  }

  isEmployed(adultIdx: number): boolean {
    return this.employedPerm.forward(adultIdx) < this.totalEmployed;
  }

  jobOfAdult(adultIdx: number): JobAssignment | undefined {
    const rank = this.employedPerm.forward(adultIdx);
    if (rank >= this.totalEmployed) return undefined;
    return this.jobOfSlot(this.slotOrder.slotOfRank(rank));
  }

  jobOfSlot(globalSlot: number): JobAssignment {
    const workplaces = this.world.workplaces;
    const workplace = workplaces[lastAtMost(workplaces.length, (i) => workplaces[i]!.slotOffset, globalSlot)]!;
    const localSlot = globalSlot - workplace.slotOffset;
    return {
      workplace,
      localSlot,
      globalSlot,
      role: this.roleOfSlot(workplace, localSlot),
      shift: shiftForSlot(workplace.staffing, localSlot),
    };
  }

  /** Which adult fills a job slot; undefined when the slot is unfilled. */
  adultOfSlot(globalSlot: number): number | undefined {
    const rank = this.slotOrder.rankOfSlot(globalSlot);
    if (rank >= this.totalEmployed) return undefined;
    return this.employedPerm.inverse(rank);
  }

  /** The role a slot works: its post, which the interior's role table names when there is one. */
  roleOfSlot(workplace: Workplace, localSlot: number): string {
    const support = this.world.interiors.get(workplace.parcelId);
    if (support) {
      const counts = chosenRoleCounts(this.seed, workplace.parcelId, support);
      let cursor = postOfSlot(workplace.staffing, localSlot);
      for (let i = 0; i < support.roles.length; i++) {
        if (cursor < counts[i]!) return support.roles[i]!.role;
        cursor -= counts[i]!;
      }
    }
    if (isSecuritySlot(workplace.staffing, localSlot)) return 'security';
    return DERIVED_ROLE[workplace.type] ?? 'worker';
  }

  typeDef(type: string): NPCTypeDef | undefined {
    return this.typeSet.types.find((t) => t.type === type);
  }

  /** Themed NPC type: job-grounded for employed adults, resident type otherwise. */
  typeOfAdult(adultIdx: number): NPCTypeDef {
    const job = this.jobOfAdult(adultIdx);
    if (job) {
      const { type: parcelType, tier } = job.workplace;
      const candidates = postCandidates(this.typeSet.types, { parcelType, tier, role: job.role });
      const r = rand(this.seed, 'wtype', job.globalSlot);
      return candidates[r.weighted(candidates.map((t) => t.weight))]!;
    }
    const { groupIdx } = this.demo.locateAdult(adultIdx);
    const tier = this.world.groups[groupIdx]!.tier;
    const candidates = this.residentTypeCandidates(tier);
    const r = rand(this.seed, 'rtype', adultIdx);
    return candidates[r.weighted(candidates.map((t) => t.weight))]!;
  }

  /** The distinct roles a workplace's rota fills, interior role table first. */
  rolesOfWorkplace(workplace: Workplace): string[] {
    const support = this.world.interiors.get(workplace.parcelId);
    const roles = new Set<string>();
    if (support) {
      const counts = chosenRoleCounts(this.seed, workplace.parcelId, support);
      support.roles.forEach((slot, i) => {
        if (counts[i]! > 0) roles.add(slot.role);
      });
    }
    if (roles.size === 0) {
      roles.add(DERIVED_ROLE[workplace.type] ?? 'worker');
      if (workplace.staffing.securityPosts > 0) roles.add('security');
    }
    return [...roles];
  }

  /** Whether the typed set holds a category that admits this role. */
  admitsRole(role: string): boolean {
    return admitsRole(this.typeSet.types, role);
  }

  residentTypeCandidates(tier: WealthTier): NPCTypeDef[] {
    let candidates = this.typeSet.types.filter(
      (t) => (t.category === 'resident' || t.category === 'street') && (!t.grounding.tiers || t.grounding.tiers.includes(tier)),
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
    const block = group.blocks[lastAtMost(group.blocks.length, (i) => group.blocks[i]!.unitOffset, unitIdx)]!;
    return { parcelId: block.parcelId, unit: unitIdx - block.unitOffset };
  }
}
