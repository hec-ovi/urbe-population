/**
 * CitySimulation facade: the whole contract surface, wired over the world,
 * population, crowd, instancing and behavior layers.
 */

import { validateInput, validateSave } from './validate.js';
import { WorldModel, type Workplace } from '../world/model.js';
import { HousingStock } from '../population/housing.js';
import { HouseholdLedger } from '../population/household.js';
import { calibrateHousing } from '../population/calibration.js';
import { Demographics } from '../population/demographics.js';
import { AssignmentModel } from '../population/assignment.js';
import { buildStats } from '../population/stats.js';
import { resolveParams, type ResolvedParams } from '../population/defaults.js';
import { CrowdModel } from '../crowd/model.js';
import { GenderResolver } from '../instancing/gender.js';
import { Instantiator } from '../instancing/instantiator.js';
import { resolvePool } from '../instancing/name-pool.js';
import { RoutineBuilder } from '../instancing/routine.js';
import { Registry, type SaveEvent, type SimulationSave } from '../instancing/registry.js';
import { BehaviorModel } from '../behavior/model.js';
import { DEFAULT_TYPE_SET } from '../defaults/default-types.js';
import { SimulationError } from '../schemas/errors.js';
import type { CityBlueprint } from '../schemas/blueprint.js';
import type { Networks } from '../schemas/networks.js';
import type { NpcSupport } from '../schemas/interiors.js';
import type { NamePool, NPCTypeSet } from '../schemas/npc-types.js';
import type { SimulationParams } from '../schemas/params.js';
import type { PopulationStats } from '../schemas/population.js';
import type { CrowdOpts, CrowdScope, CrowdSlice } from '../schemas/crowd.js';
import type {
  BehaviorState,
  FlagOp,
  JobPlace,
  NPCContinuityState,
  NPCInstance,
  NPCQuery,
  ReservedSpec,
  VendorQuery,
} from '../schemas/npc.js';

export interface SimulationInput {
  seed: string | number;
  blueprint: CityBlueprint;
  networks?: Networks;
  /** parcelId -> interior NpcSupport. */
  interiors?: Record<string, NpcSupport>;
  npcTypes?: NPCTypeSet;
  namePool?: NamePool;
  params?: SimulationParams;
}

export type InstantiateHandle = { npcId: string } | { crowdId: string; timeMin: number } | VendorQuery;

export class CitySimulation {
  private readonly params: ResolvedParams;
  private readonly typeSet: NPCTypeSet;
  private readonly calibrationFactor: number;
  private readonly world: WorldModel;
  private readonly demo: Demographics;
  private readonly assignment: AssignmentModel;
  private readonly genders: GenderResolver;
  private readonly registry = new Registry();
  private readonly instantiator: Instantiator;
  private readonly behavior: BehaviorModel;
  private crowdModel: CrowdModel | undefined;
  private stats: PopulationStats | undefined;

  constructor(private readonly input: SimulationInput) {
    validateInput(input);
    this.params = resolveParams(input.params);
    this.typeSet = input.npcTypes ?? DEFAULT_TYPE_SET;
    const namePool = input.namePool ?? this.typeSet.namePool;
    const housing = new HousingStock(input.seed, input.blueprint);
    const ledger = new HouseholdLedger(input.seed, this.params.householdMix);
    this.calibrationFactor = calibrateHousing(housing, ledger, this.params.occupancyRate, input.blueprint.stats.population);
    this.world = new WorldModel(input.seed, input.blueprint, input.networks, this.params, housing.groups(this.calibrationFactor), input.interiors);
    this.demo = new Demographics(this.world, ledger, this.params);
    this.assignment = new AssignmentModel(input.seed, this.world, this.demo, this.typeSet, this.params);
    this.genders = new GenderResolver(input.seed, this.demo, this.params);
    this.instantiator = new Instantiator(input.seed, this.world, this.demo, this.assignment, resolvePool(namePool), this.registry, this.genders);
    this.behavior = new BehaviorModel(input.seed, this.world, this.registry);
  }

  populationStats(): PopulationStats {
    this.stats ??= buildStats(this.world, this.demo, this.assignment, this.calibrationFactor);
    return this.stats;
  }

  crowd(timeMin: number, scope: CrowdScope, opts?: CrowdOpts): CrowdSlice {
    return this.crowdLayer().crowd(timeMin, scope, opts);
  }

  instantiate(handle: InstantiateHandle): NPCInstance {
    if ('npcId' in handle) {
      const inst = this.instantiator.byNpcId(handle.npcId);
      this.registry.log({ k: 'npc', npcId: handle.npcId });
      return inst;
    }
    if ('crowdId' in handle) {
      const agent = this.crowdLayer().agentAt(handle.crowdId, handle.timeMin);
      const inst = this.instantiator.fromCrowd(handle.crowdId, handle.timeMin, agent);
      this.registry.log({ k: 'crowd', crowdId: handle.crowdId, timeMin: handle.timeMin });
      return inst;
    }
    return this.getNPCVendor(handle);
  }

  getNPC(npcId: string): NPCInstance {
    const inst = this.registry.instances.get(npcId);
    if (!inst) throw new SimulationError('E_UNKNOWN_ID', `NPC ${npcId} is not instanced`);
    return inst;
  }

  getNPCVendor(query: VendorQuery): NPCInstance {
    if (!Number.isFinite(query.timeMin) || query.timeMin < 0) throw new SimulationError('E_TIME', `invalid time ${query.timeMin}`);
    const inst = this.instantiator.vendor(query);
    this.registry.log({ k: 'vendor', query });
    return inst;
  }

  findNPCs(query: NPCQuery): NPCInstance[] {
    const out: NPCInstance[] = [];
    for (const inst of this.registry.instances.values()) {
      if (inst.flags.dead && !query.includeDead) continue;
      if (query.type && inst.type !== query.type) continue;
      if (query.parcelId && inst.home.parcelId !== query.parcelId && inst.job?.parcelId !== query.parcelId) continue;
      if (query.districtId) {
        const home = this.world.parcelsById.get(inst.home.parcelId);
        if (home?.districtId !== query.districtId) continue;
      }
      if (query.flag && !inst.flags.custom.includes(query.flag)) continue;
      out.push(inst);
    }
    return out;
  }

  behaviorAt(npcId: string, timeMin: number): BehaviorState {
    return this.behavior.behaviorAt(npcId, timeMin);
  }

  continuityAt(npcId: string, timeMin: number): NPCContinuityState {
    return this.behavior.continuityAt(npcId, timeMin);
  }

  interrupt(npcId: string, timeMin: number): void {
    this.behavior.interrupt(npcId, timeMin);
  }

  resume(npcId: string, timeMin: number): void {
    this.behavior.resume(npcId, timeMin);
  }

  applyFlag(npcId: string, op: FlagOp): void {
    const inst = this.getNPC(npcId);
    if (inst.flags.dead) throw new SimulationError('E_DEAD', `NPC ${npcId} is dead`);
    switch (op.kind) {
      case 'die':
        inst.flags.dead = true;
        break;
      case 'custom':
        if (!inst.flags.custom.includes(op.tag)) inst.flags.custom.push(op.tag);
        break;
      case 'resign': {
        if (!inst.job && !inst.transitJob) throw new SimulationError('E_CONFLICT', `NPC ${npcId} has no job to resign`);
        this.vacateJob(npcId);
        delete inst.job;
        delete inst.transitJob;
        this.rebuildRoutine(inst);
        break;
      }
      case 'promote': {
        const parcelId = op.toParcelId ?? inst.job?.parcelId;
        if (!parcelId) throw new SimulationError('E_CONFLICT', `NPC ${npcId} has no job to promote from; pass toParcelId`);
        if (!this.world.workplacesByParcel.has(parcelId)) throw new SimulationError('E_UNKNOWN_ID', `no workplace parcel ${parcelId}`);
        this.vacateJob(npcId);
        inst.job = {
          parcelId,
          role: 'executive',
          shift: { startMin: 9 * 60, endMin: 18 * 60, days: [0, 1, 2, 3, 4], kind: 'day' },
        };
        delete inst.transitJob;
        this.rebuildRoutine(inst);
        break;
      }
    }
    this.registry.log({ k: 'flag', npcId, op });
  }

  reserveNPC(spec: ReservedSpec): NPCInstance {
    const inst = this.instantiator.reserve(spec);
    this.registry.log({ k: 'reserve', spec });
    return inst;
  }

  serialize(): SimulationSave {
    return this.registry.save(this.input.seed);
  }

  /** Replays a save's interaction log through the normal code paths. */
  restore(save: SimulationSave): void {
    validateSave(save);
    if (save.seed !== String(this.input.seed)) {
      throw new SimulationError('E_INVALID_INPUT', 'save.seed: save belongs to a different seed', { field: 'save.seed' });
    }
    for (const e of save.events) {
      this.replay(e);
      this.registry.log(e);
    }
  }

  private replay(e: SaveEvent): void {
    this.registry.replaying = true;
    try {
      switch (e.k) {
        case 'crowd':
          this.instantiate({ crowdId: e.crowdId, timeMin: e.timeMin });
          break;
        case 'vendor':
          this.getNPCVendor(e.query);
          break;
        case 'npc':
          this.instantiate({ npcId: e.npcId });
          break;
        case 'reserve':
          this.reserveNPC(e.spec);
          break;
        case 'flag':
          this.applyFlag(e.npcId, e.op);
          break;
        case 'interrupt':
          this.interrupt(e.npcId, e.timeMin);
          break;
        case 'resume':
          this.resume(e.npcId, e.timeMin);
          break;
      }
    } finally {
      this.registry.replaying = false;
    }
  }

  /** Built on first use: it reads the aggregate stats, which stay lazy until then. */
  private crowdLayer(): CrowdModel {
    this.crowdModel ??= new CrowdModel(
      this.input.seed,
      this.world,
      this.populationStats(),
      this.typeSet,
      this.params,
      this.assignment,
      this.genders,
      this.registry,
    );
    return this.crowdModel;
  }

  private vacateJob(npcId: string): void {
    const slot = this.registry.jobSlots.get(npcId);
    if (slot !== undefined) {
      this.registry.vacatedSlots.add(slot);
      this.registry.jobSlots.delete(npcId);
    }
  }

  /** The workplace a job's place names: a building, a station, or a route. */
  private workplaceOf(place: JobPlace): Workplace | undefined {
    if (place.kind === 'parcel') return this.world.workplacesByParcel.get(place.id);
    if (place.kind === 'stop') return this.world.workplacesByStop.get(place.id);
    return this.world.workplaces.find((w) => w.place.kind === 'route' && w.place.id === place.id);
  }

  private rebuildRoutine(inst: NPCInstance): void {
    const category = this.typeSet.types.find((t) => t.type === inst.type)?.category ?? 'resident';
    const place: JobPlace | undefined = inst.job ? { kind: 'parcel', id: inst.job.parcelId } : inst.transitJob?.place;
    const publicJob = inst.job ?? inst.transitJob;
    const job = place && publicJob
      ? {
          workplace: this.workplaceOf(place)!,
          localSlot: 0,
          globalSlot: -1,
          role: publicJob.role,
          shift: publicJob.shift,
        }
      : undefined;
    inst.routine = new RoutineBuilder(this.input.seed, this.world).build(inst.npcId, category, inst.home.parcelId, job);
  }
}

export function createSimulation(input: SimulationInput): CitySimulation {
  return new CitySimulation(input);
}

export function restoreSimulation(input: SimulationInput, save: SimulationSave): CitySimulation {
  const sim = new CitySimulation(input);
  sim.restore(save);
  return sim;
}
