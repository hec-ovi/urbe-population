# CONTRACT: simulation

Purpose: statistical NPC population with lazy instantiation: crowds run cheap by type, a specific NPC gets a full deterministic life (home, job, family, routine, name) only on interaction, and stays persistent from then on.

Status: v0.1 implemented and tested. Statistical defaults documented in docs/RESEARCH.md. Breaking changes go through the orchestrator.

## Conventions
- Time: integer minutes since world epoch (Monday 00:00). Day = floor(t / 1440) % 7, 0 = Monday; minute of day = t % 1440. Routines repeat weekly.
- Determinism: aggregate outputs (populationStats, crowd) are pure functions of inputs and time, identical for a seed regardless of call order. Instanced outputs depend on the ordered interaction history: same seed and same interaction order, identical population.
- No LLM, no wall clock, no ambient randomness, no I/O: an embeddable TypeScript library the engine hosts. A future multiplayer source of truth (API or websocket) would wrap this same surface; not built now.

## In
`createSimulation(input): CitySimulation`

- `seed: string | number`
- `blueprint`: [src/schemas/blueprint.ts](src/schemas/blueprint.ts): consumed slice of the atlas CityBlueprint (v0.2 mirror); a full atlas blueprint satisfies it.
- `networks?`: [src/schemas/networks.ts](src/schemas/networks.ts): consumed slice of connections Networks (walk graph, timetabled transit routes). Absent: fallback derived from blueprint transit with default headways.
- `interiors?`: [src/schemas/interiors.ts](src/schemas/interiors.ts): parcelId -> NpcSupport (mirror of ../interior/schemas/npc.schema.json). Absent: per-type synthetic role sets.
- `npcTypes?`: [src/schemas/npc-types.ts](src/schemas/npc-types.ts): mirror of naming's npc-types schema (typed set with categories, grounding, weights, embedded themed name pool). Absent: built-in default set.
- `namePool?`: explicit override pool ([src/schemas/npc-types.ts](src/schemas/npc-types.ts)). Precedence: this override, else the set's embedded pool, else the built-in default. Names repeat across NPCs by design.
- `params?`: [src/schemas/params.ts](src/schemas/params.ts): statistical overrides, all defaulted from research.

## Out (CitySimulation)
- `populationStats(): PopulationStats` ([src/schemas/population.ts](src/schemas/population.ts)): residents, households, employment and NPC type counts per district and tier. Consumed by naming.
- `crowd(timeMin, scope, opts?): CrowdSlice` ([src/schemas/crowd.ts](src/schemas/crowd.ts)): groups carry exact typed counts; agents are a deterministic sample for every scope kind (city, district, edge, stop, parcel), capped by `opts.maxAgents` (default 64). Every agent's crowdId is stable for its trip and is an instantiation handle; parcel agents are the on-duty workers, so their handles resolve to those exact NPCs.
- `instantiate(handle): NPCInstance` ([src/schemas/npc.ts](src/schemas/npc.ts)): handle is `{ crowdId, timeMin }`, `{ npcId }` (family stubs carry npcIds) or a VendorQuery. Assigns the full life, conditioned on everything already instantiated; persistent from then on.
- `getNPC(npcId): NPCInstance`: instanced NPCs only.
- `getNPCVendor(query: VendorQuery): NPCInstance`: the on-duty worker for a place, type or role at a time; instantiates if needed. Quest layer entry point.
- `findNPCs(query: NPCQuery): NPCInstance[]`: query over instanced NPCs; dead ones excluded unless asked.
- `behaviorAt(npcId, timeMin): BehaviorState`: state machine snapshot: interior anchor step or walk intent, street edge, transit leg, home. Interior path geometry stays with the host (interior ships findPath).
- `interrupt(npcId, timeMin)` / `resume(npcId, timeMin)`: player interaction pauses the routine; resume continues it.
- `applyFlag(npcId, op: FlagOp)`: resign, promote (reassigns job, moves home when tier changes), die (dead NPCs never match vendor or quest queries), custom tags.
- `reserveNPC(spec: ReservedSpec): NPCInstance`: quest layer pre-instanced NPC with fixed name and type; consumes a real statistical slot.
- `serialize(): SimulationSave` / `restoreSimulation(input, save)`: persists the instanced set, flags and reservations; restore with identical inputs reproduces the exact state.

## Errors
Closed set, thrown as `SimulationError { code, message, details? }` ([src/schemas/errors.ts](src/schemas/errors.ts)):
- `E_INVALID_INPUT`: input fails validation; message names the field.
- `E_UNKNOWN_ID`: npc, parcel, district, edge, stop or line id not found.
- `E_STALE_HANDLE`: crowdId not alive at the given time.
- `E_NO_MATCH`: no NPC can satisfy the query or reservation.
- `E_DEAD`: behavior or flag operation on a dead NPC.
- `E_CONFLICT`: reservation or flag conflicts with already-instantiated state.
- `E_TIME`: time outside the supported range.

## Invariants
- Same seed and inputs: identical populationStats and crowd for any query order.
- Every blueprint district appears in populationStats.perDistrict and is a valid crowd scope, residents or not; districts without residents still carry their working population in crowds.
- Same seed and same interaction order: identical instanced population.
- Conservation: instanced NPCs never contradict aggregate stats; an assigned home unit, job slot or crowd identity is never reassigned; an instance never changes identity, home or family except through applyFlag.
- Cost: crowd() and instantiate() cost does not grow with total population; full computation only for instanced NPCs.
- Staffing honors interior role [min, max] counts; 24/7 places get multi-shift coverage plus security; night-only places staff night shifts; every staffed job maps to an employed resident with a commute.
- Standalone: runs against fixture blueprints with no other layer present.

## Depends on
- ../atlas/CONTRACT.md (blueprint v0.2)
- ../connections/CONTRACT.md (networks.schema.json: walk + transit slice)
- ../interior/CONTRACT.md (npc.schema.json)
- ../naming/CONTRACT.md (npc-types.schema.json)
