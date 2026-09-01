/**
 * Lazy full instantiation: turns an identity index, crowd handle, vendor
 * query or reservation into a persistent NPCInstance, conditioned on the
 * registry so instances never contradict each other or the aggregates.
 */

import { rand } from '../core/rng.js';
import { dayOf, minuteOfDay } from '../core/time.js';
import { shiftCoversTime } from '../population/jobs.js';
import { parseHandle } from '../crowd/handles.js';
import { pickName } from './names.js';
import { RoutineBuilder } from './routine.js';
import { SimulationError } from '../schemas/errors.js';
import type { Demographics } from '../population/demographics.js';
import type { AssignmentModel, JobAssignment } from '../population/assignment.js';
import type { Registry } from './registry.js';
import type { WorldModel, Workplace } from '../world/model.js';
import type { NamePool } from '../schemas/npc-types.js';
import type { FamilyMember, NPCInstance, NPCName, ReservedSpec, VendorQuery } from '../schemas/npc.js';
import type { CrowdAgent } from '../schemas/crowd.js';

const ALIBI_ATTEMPTS = 128;
const ALIBI_STRICT_ATTEMPTS = 64;
const RESERVE_ATTEMPTS = 512;
const OUTDOOR_ACTIVITIES = new Set(['commuting', 'leisure', 'shopping', 'transit_wait']);

export class Instantiator {
  private readonly routines: RoutineBuilder;

  constructor(
    private readonly seed: string | number,
    private readonly world: WorldModel,
    private readonly demo: Demographics,
    private readonly assignment: AssignmentModel,
    private readonly namePool: NamePool,
    private readonly registry: Registry,
  ) {
    this.routines = new RoutineBuilder(seed, world);
  }

  byNpcId(npcId: string): NPCInstance {
    const existing = this.registry.instances.get(npcId);
    if (existing) return existing;
    const adult = /^a(\d+)$/.exec(npcId);
    if (adult) {
      const idx = Number(adult[1]);
      if (idx >= this.demo.totalAdults) throw new SimulationError('E_UNKNOWN_ID', `no NPC ${npcId}`);
      return this.buildAdult(idx);
    }
    const kid = /^k(\d+)\.(\d+)\.(\d+)$/.exec(npcId);
    if (kid) return this.buildKid(Number(kid[1]), Number(kid[2]), Number(kid[3]));
    throw new SimulationError('E_UNKNOWN_ID', `no NPC ${npcId}`);
  }

  fromCrowd(crowdId: string, timeMin: number, agent: CrowdAgent): NPCInstance {
    const bound = this.registry.crowdBindings.get(crowdId);
    if (bound) return this.registry.instances.get(bound)!;
    const h = parseHandle(crowdId);
    if (h?.kind === 'parcel') {
      // A parcel handle names a filled job slot: the person is determinate.
      const wp = this.world.workplacesByParcel.get(h.id)!;
      const adultIdx = this.assignment.adultOfSlot(wp.slotOffset + h.slot)!;
      const npcId = `a${adultIdx}`;
      const instance = this.registry.instances.get(npcId) ?? this.buildAdult(adultIdx);
      this.registry.crowdBindings.set(crowdId, npcId);
      return instance;
    }
    for (let k = 0; k < ALIBI_ATTEMPTS; k++) {
      const adultIdx = rand(this.seed, 'alibi', crowdId, k).int(this.demo.totalAdults);
      if (this.registry.claimedAdults.has(adultIdx)) continue;
      if (this.assignment.typeOfAdult(adultIdx).type !== agent.type) continue;
      if (k < ALIBI_STRICT_ATTEMPTS && !this.plausiblyOutdoors(adultIdx, timeMin)) continue;
      const instance = this.buildAdult(adultIdx);
      this.registry.crowdBindings.set(crowdId, instance.npcId);
      return instance;
    }
    throw new SimulationError('E_NO_MATCH', `no free NPC matches crowd agent ${crowdId}`);
  }

  vendor(query: VendorQuery): NPCInstance {
    const workplaces = this.candidateWorkplaces(query);
    for (const wp of workplaces) {
      for (let local = 0; local < wp.staffing.slotCount; local++) {
        const globalSlot = wp.slotOffset + local;
        if (this.registry.vacatedSlots.has(globalSlot)) continue;
        const job = this.assignment.jobOfSlot(globalSlot);
        if (query.role && job.role !== query.role) continue;
        if (!this.shiftCovers(job, query.timeMin)) continue;
        const adultIdx = this.assignment.adultOfSlot(globalSlot);
        if (adultIdx === undefined) continue;
        if (query.type && this.assignment.typeOfAdult(adultIdx).type !== query.type) continue;
        const npcId = `a${adultIdx}`;
        const existing = this.registry.instances.get(npcId);
        if (existing) {
          if (existing.flags.dead || !existing.job) continue;
          return existing;
        }
        return this.buildAdult(adultIdx);
      }
    }
    throw new SimulationError('E_NO_MATCH', 'no on-duty NPC matches the vendor query');
  }

  reserve(spec: ReservedSpec): NPCInstance {
    let sawInstanced = false;
    for (let k = 0; k < RESERVE_ATTEMPTS; k++) {
      const adultIdx = rand(this.seed, 'reserve', spec.name.given, spec.name.family, k).int(this.demo.totalAdults);
      if (!this.matchesSpec(adultIdx, spec)) continue;
      if (this.registry.claimedAdults.has(adultIdx)) {
        sawInstanced = true;
        continue;
      }
      const instance = this.buildAdult(adultIdx, spec.name);
      return instance;
    }
    if (sawInstanced) throw new SimulationError('E_CONFLICT', 'every NPC matching the reservation is already instanced');
    throw new SimulationError('E_NO_MATCH', 'no NPC matches the reservation spec');
  }

  private matchesSpec(adultIdx: number, spec: ReservedSpec): boolean {
    if (this.assignment.typeOfAdult(adultIdx).type !== spec.type) return false;
    const { groupIdx } = this.demo.locateAdult(adultIdx);
    if (spec.homeDistrictId && this.world.groups[groupIdx]!.districtId !== spec.homeDistrictId) return false;
    const job = this.assignment.jobOfAdult(adultIdx);
    if (spec.jobParcelId && job?.workplace.parcelId !== spec.jobParcelId) return false;
    if (spec.role && job?.role !== spec.role) return false;
    return true;
  }

  private candidateWorkplaces(query: VendorQuery): Workplace[] {
    if (query.parcelId) {
      const wp = this.world.workplacesByParcel.get(query.parcelId);
      if (!wp) throw new SimulationError('E_UNKNOWN_ID', `no workplace parcel ${query.parcelId}`);
      return [wp];
    }
    if (query.type) {
      const parcelTypes = this.assignment.typeDef(query.type)?.grounding.parcelTypes;
      if (parcelTypes) return this.world.workplaces.filter((w) => parcelTypes.includes(w.type));
    }
    return this.world.workplaces;
  }

  shiftCovers(job: JobAssignment, timeMin: number): boolean {
    return shiftCoversTime(job.shift, timeMin);
  }

  private plausiblyOutdoors(adultIdx: number, timeMin: number): boolean {
    const entry = this.routineActivityAt(adultIdx, timeMin);
    return entry !== undefined && OUTDOOR_ACTIVITIES.has(entry);
  }

  private routineActivityAt(adultIdx: number, timeMin: number): string | undefined {
    const routine = this.buildRoutineFor(adultIdx);
    const day = dayOf(timeMin);
    const m = minuteOfDay(timeMin);
    for (const e of routine) {
      if (e.days.includes(day) && m >= e.startMin && m < e.endMin) return e.activity;
    }
    return undefined;
  }

  private buildRoutineFor(adultIdx: number) {
    const { groupIdx, h } = this.demo.locateAdult(adultIdx);
    const home = this.assignment.homeOf(groupIdx, h);
    const job = this.assignment.jobOfAdult(adultIdx);
    const type = this.assignment.typeOfAdult(adultIdx);
    return this.routines.build(`a${adultIdx}`, type.category, home.parcelId, job);
  }

  private buildAdult(adultIdx: number, nameOverride?: NPCName): NPCInstance {
    const npcId = `a${adultIdx}`;
    const { groupIdx, h, member } = this.demo.locateAdult(adultIdx);
    const home = this.assignment.homeOf(groupIdx, h);
    const job = this.assignment.jobOfAdult(adultIdx);
    const type = this.assignment.typeOfAdult(adultIdx);
    const instance: NPCInstance = {
      npcId,
      name: nameOverride ?? this.memberName(groupIdx, h, npcId),
      type: type.type,
      home: { parcelId: home.parcelId, unit: home.unit },
      ...(job
        ? { job: { parcelId: job.workplace.parcelId, role: job.role, shift: job.shift } }
        : {}),
      family: this.familyOf(groupIdx, h, member),
      routine: this.routines.build(npcId, type.category, home.parcelId, job),
      flags: { dead: false, custom: [] },
    };
    this.registry.instances.set(npcId, instance);
    this.registry.claimedAdults.add(adultIdx);
    if (job) this.registry.jobSlots.set(npcId, job.globalSlot);
    return instance;
  }

  private buildKid(groupIdx: number, h: number, i: number): NPCInstance {
    if (groupIdx >= this.world.groups.length || h >= this.demo.households(groupIdx)) {
      throw new SimulationError('E_UNKNOWN_ID', `no NPC k${groupIdx}.${h}.${i}`);
    }
    const shape = this.demo.householdShape(groupIdx, h);
    if (i >= shape.kids) throw new SimulationError('E_UNKNOWN_ID', `no NPC k${groupIdx}.${h}.${i}`);
    const npcId = `k${groupIdx}.${h}.${i}`;
    const home = this.assignment.homeOf(groupIdx, h);
    const tier = this.world.groups[groupIdx]!.tier;
    const type = this.assignment.residentTypeCandidates(tier)[0]!;
    const family: FamilyMember[] = [];
    for (let m = 0; m < shape.adults; m++) {
      const parentId = `a${this.demo.adultIndexOf(groupIdx, h, m)}`;
      family.push(this.stub(parentId, 'parent', this.memberName(groupIdx, h, parentId)));
    }
    for (let s = 0; s < shape.kids; s++) {
      if (s === i) continue;
      const sibId = `k${groupIdx}.${h}.${s}`;
      family.push(this.stub(sibId, 'sibling', this.memberName(groupIdx, h, sibId)));
    }
    const instance: NPCInstance = {
      npcId,
      name: this.memberName(groupIdx, h, npcId),
      type: type.type,
      home: { parcelId: home.parcelId, unit: home.unit },
      family,
      routine: this.routines.build(npcId, 'resident', home.parcelId, undefined),
      flags: { dead: false, custom: [] },
    };
    this.registry.instances.set(npcId, instance);
    return instance;
  }

  /** Couple and kid households share a family name; roommates keep their own. */
  private memberName(groupIdx: number, h: number, npcId: string): NPCName {
    const shape = this.demo.householdShape(groupIdx, h);
    const own = pickName(this.seed, this.namePool, npcId);
    if (shape.form === 'shared' || shape.form === 'single') return own;
    const family = rand(this.seed, 'famname', groupIdx, h).pick(this.namePool.family);
    return { given: own.given, family };
  }

  private familyOf(groupIdx: number, h: number, member: number): FamilyMember[] {
    const shape = this.demo.householdShape(groupIdx, h);
    const out: FamilyMember[] = [];
    for (let m = 0; m < shape.adults; m++) {
      if (m === member) continue;
      const id = `a${this.demo.adultIndexOf(groupIdx, h, m)}`;
      const relation = shape.form === 'shared' ? 'roommate' : 'partner';
      out.push(this.stub(id, relation, this.memberName(groupIdx, h, id)));
    }
    for (let i = 0; i < shape.kids; i++) {
      const id = `k${groupIdx}.${h}.${i}`;
      out.push(this.stub(id, 'child', this.memberName(groupIdx, h, id)));
    }
    return out;
  }

  private stub(npcId: string, relation: FamilyMember['relation'], name: NPCName): FamilyMember {
    return { npcId, relation, name, instantiated: this.registry.instances.has(npcId) };
  }
}
