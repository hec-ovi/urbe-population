import type { CityBlueprint } from './blueprint.js';
import type { Networks } from './networks.js';
import type { NpcSupport } from './interiors.js';
import type { NamePool, NPCTypeSet } from './npc-types.js';
import type { SimulationParams } from './params.js';
import type { VendorQuery } from './npc.js';

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

export type InstantiateHandle = { npcId: string } | CrowdInstantiate | VendorQuery;

export interface CrowdInstantiate {
  crowdId: string;
  timeMin: number;
  /**
   * The body seed the host already draws for this handle, an integer from 0
   * to 4294967295. A person this call newly establishes takes it; a bound
   * handle or an established person keeps its own seed.
   */
  appearanceSeed?: number;
}

