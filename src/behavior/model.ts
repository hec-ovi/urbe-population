/**
 * Behavior projection for instanced NPCs: routine entry at a time mapped to a
 * state-machine snapshot, with interior anchor steps when the workplace has
 * an NpcSupport instance. A platform post reads as street work at its stop and
 * a driver as transit on their route. Interruptible, resumable, deterministic.
 */

import { rand } from '../core/rng.js';
import { dayOf, minuteOfDay } from '../core/time.js';
import { SimulationError } from '../schemas/errors.js';
import type { Registry } from '../instancing/registry.js';
import type { WorldModel } from '../world/model.js';
import type { BehaviorState, NPCInstance, RoutineEntry } from '../schemas/npc.js';
import type { NpcSupport } from '../schemas/interiors.js';

export class BehaviorModel {
  constructor(
    private readonly seed: string | number,
    private readonly world: WorldModel,
    private readonly registry: Registry,
  ) {}

  behaviorAt(npcId: string, timeMin: number): BehaviorState {
    const inst = this.registry.instances.get(npcId);
    if (!inst) throw new SimulationError('E_UNKNOWN_ID', `NPC ${npcId} is not instanced`);
    if (inst.flags.dead) throw new SimulationError('E_DEAD', `NPC ${npcId} is dead`);
    if (!Number.isFinite(timeMin) || timeMin < 0) throw new SimulationError('E_TIME', `invalid time ${timeMin}`);
    const entry = findEntry(inst.routine, timeMin) ?? inst.routine[0]!;
    const interrupted = this.registry.interrupted.has(npcId);

    if (entry.activity === 'sleeping' || (entry.activity === 'home' && entry.place.kind === 'parcel')) {
      return { mode: 'home', activity: entry.activity, place: entry.place, interrupted };
    }
    if (entry.transitLeg || entry.place.kind === 'route') {
      return { mode: 'transit', activity: entry.activity, place: entry.place, interrupted };
    }
    if (entry.place.kind === 'edge' || entry.place.kind === 'stop') {
      return { mode: 'street', activity: entry.activity, place: entry.place, interrupted };
    }
    const state: BehaviorState = { mode: 'interior', activity: entry.activity, place: entry.place, interrupted };
    if (entry.activity === 'working' && inst.job && entry.place.kind === 'parcel' && entry.place.id === inst.job.parcelId) {
      const support = this.world.interiors.get(inst.job.parcelId);
      if (support) {
        const interior = this.interiorStep(inst, support, entry, timeMin);
        if (interior) state.interior = interior;
      }
    }
    return state;
  }

  interrupt(npcId: string, timeMin: number): void {
    const inst = this.require(npcId);
    if (inst.flags.dead) throw new SimulationError('E_DEAD', `NPC ${npcId} is dead`);
    this.registry.interrupted.set(npcId, timeMin);
    this.registry.log({ k: 'interrupt', npcId, timeMin });
  }

  resume(npcId: string, timeMin: number): void {
    this.require(npcId);
    this.registry.interrupted.delete(npcId);
    this.registry.log({ k: 'resume', npcId, timeMin });
  }

  private require(npcId: string): NPCInstance {
    const inst = this.registry.instances.get(npcId);
    if (!inst) throw new SimulationError('E_UNKNOWN_ID', `NPC ${npcId} is not instanced`);
    return inst;
  }

  /** Walks the role's routine loop with seeded dwell picks to the current step. */
  private interiorStep(inst: NPCInstance, support: NpcSupport, entry: RoutineEntry, timeMin: number): BehaviorState['interior'] {
    const roleSlot = support.roles.find((rs) => rs.role === inst.job!.role);
    if (!roleSlot) return undefined;
    const routine = support.routines.find((rt) => rt.role === roleSlot.id);
    if (!routine || routine.steps.length === 0) return undefined;
    const m = minuteOfDay(timeMin);
    let elapsed = m - entry.startMin;
    if (elapsed < 0) elapsed += 1440;

    const dwell = (stepIdx: number, cycle: number): number => {
      const step = routine.steps[stepIdx]!;
      const [min, max] = step.minutes;
      return min + rand(this.seed, 'dwell', inst.npcId, cycle, stepIdx).int(Math.max(1, Math.round(max - min + 1)));
    };

    let cycle = 0;
    let rem = elapsed;
    for (let guard = 0; guard < 200; guard++) {
      let cycleLen = 0;
      for (let i = 0; i < routine.steps.length; i++) cycleLen += dwell(i, cycle);
      if (rem < cycleLen || cycleLen <= 0) break;
      rem -= cycleLen;
      cycle++;
    }
    let stepIdx = 0;
    let within = rem;
    for (let i = 0; i < routine.steps.length; i++) {
      const d = dwell(i, cycle);
      if (within < d) {
        stepIdx = i;
        break;
      }
      within -= d;
      stepIdx = i;
    }
    const step = routine.steps[stepIdx]!;
    if (within < 1 && stepIdx > 0) {
      const prev = routine.steps[stepIdx - 1]!;
      return { walk: { fromAnchorId: prev.anchor, toAnchorId: step.anchor } };
    }
    return { at: { anchorId: step.anchor, animation: step.animation, untilMin: timeMin + (dwell(stepIdx, cycle) - within) } };
  }
}

export function findEntry(routine: RoutineEntry[], timeMin: number): RoutineEntry | undefined {
  const day = dayOf(timeMin);
  const m = minuteOfDay(timeMin);
  return routine.find((e) => e.days.includes(day) && m >= e.startMin && m < e.endMin);
}
