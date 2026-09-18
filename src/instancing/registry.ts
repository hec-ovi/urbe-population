/**
 * The discovered set: instanced NPCs, crowd bindings, vacated job slots and
 * the replayable interaction log that serialize/restore is built on.
 */

import { SimulationError } from '../schemas/errors.js';
import type { FlagOp, NPCInstance, ReservedSpec, VendorQuery } from '../schemas/npc.js';

export type SaveEvent =
  | { k: 'crowd'; crowdId: string; timeMin: number }
  | { k: 'vendor'; query: VendorQuery }
  | { k: 'npc'; npcId: string }
  | { k: 'reserve'; spec: ReservedSpec }
  | { k: 'flag'; npcId: string; op: FlagOp }
  | { k: 'interrupt'; npcId: string; timeMin: number }
  | { k: 'resume'; npcId: string; timeMin: number };

export interface SimulationSave {
  version: string;
  seed: string;
  events: SaveEvent[];
}

export class Registry {
  /** Most people this session establishes, from params.maxInstances. */
  constructor(readonly capacity: number) {}

  readonly instances = new Map<string, NPCInstance>();
  /** crowdId -> npcId, so re-instantiating a crowd agent returns the same NPC. */
  readonly crowdBindings = new Map<string, string>();
  /** npcId -> global job slot, for vacating on resign or promote. */
  readonly jobSlots = new Map<string, number>();
  /** Global job slots freed by resign or promote; vendor queries skip them. */
  readonly vacatedSlots = new Set<number>();
  /** Adult indices already claimed, so alibi search never reuses a person. */
  readonly claimedAdults = new Set<number>();
  readonly interrupted = new Map<string, number>();
  private readonly events: SaveEvent[] = [];
  replaying = false;

  /** Refuses a new person once the capacity is full; an established one always passes. */
  admit(npcId: string): void {
    if (this.instances.has(npcId) || this.instances.size < this.capacity) return;
    throw new SimulationError('E_CAPACITY', `the simulation already holds its ${this.capacity} established people`, {
      capacity: this.capacity,
    });
  }

  log(e: SaveEvent): void {
    if (!this.replaying) this.events.push(e);
  }

  save(seed: string | number): SimulationSave {
    return { version: '1', seed: String(seed), events: [...this.events] };
  }
}
