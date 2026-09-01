# CONTRACT: simulation

Purpose: statistical NPC population with lazy instantiation: crowds run cheap by type, a specific NPC gets a full deterministic life (home, job, family, routine, name) only on interaction, and stays persistent from then on.

Status: v0.5.0 implemented and tested. Statistical defaults documented in docs/RESEARCH.md. Breaking changes go through the orchestrator.

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
- `namePool?`: explicit override pool ([src/schemas/npc-types.ts](src/schemas/npc-types.ts)). Precedence: this override, else the set's embedded pool, else the built-in default. Names repeat across NPCs by design. A pool carrying naming's `givenByGender` buckets is drawn per gender; a pool without them serves every NPC the whole `given` list.
- `params?`: [src/schemas/params.ts](src/schemas/params.ts): statistical overrides, all defaulted from research.

## Out (CitySimulation)
- `populationStats(): PopulationStats` ([src/schemas/population.ts](src/schemas/population.ts)): residents, households, employment and NPC type counts per district and tier, plus the `calibrationFactor` that made residents match the blueprint (invariants). Consumed by naming.
- `crowd(timeMin, scope, opts?): CrowdSlice` ([src/schemas/crowd.ts](src/schemas/crowd.ts)): groups carry exact typed counts. City, district, edge, stop and parcel scopes return a deterministic agent sample capped by `opts.maxAgents` (default 64); a radius scope `{ kind: 'radius', x, z, metres }` returns every street and stop agent inside the circle, never capped, so the engine asks for exactly what it renders (indoor staff stay on parcel scopes). Every agent's crowdId is stable for its trip and is an instantiation handle, and every agent carries the `gender` its handle resolves to; parcel agents are the on-duty workers, so their handles resolve to those exact NPCs. Street presence follows the researched share of the population in public space by hour (docs/RESEARCH.md), scaled by `params.streetDensity`, and concentrates on the streets whose land use pulls it.
- `instantiate(handle): NPCInstance` ([src/schemas/npc.ts](src/schemas/npc.ts)): handle is `{ crowdId, timeMin }`, `{ npcId }` (family stubs carry npcIds) or a VendorQuery. Assigns the full life, conditioned on everything already instantiated; persistent from then on.
- `getNPC(npcId): NPCInstance`: instanced NPCs only.
- `getNPCVendor(query: VendorQuery): NPCInstance`: the on-duty worker for a place, type or role at a time; instantiates if needed. Quest layer entry point.
- `findNPCs(query: NPCQuery): NPCInstance[]`: query over instanced NPCs; dead ones excluded unless asked.
- `behaviorAt(npcId, timeMin): BehaviorState`: state machine snapshot: interior anchor step or walk intent, street edge, transit leg, home. Interior path geometry stays with the host (interior ships findPath).
- `interrupt(npcId, timeMin)` / `resume(npcId, timeMin)`: player interaction pauses the routine; resume continues it.
- `applyFlag(npcId, op: FlagOp)`: resign, promote (reassigns job, moves home when tier changes), die (dead NPCs never match vendor or quest queries), custom tags.
- `reserveNPC(spec: ReservedSpec): NPCInstance`: quest layer pre-instanced NPC with fixed name and type; consumes a real statistical slot. `spec.gender` is optional: absent, it comes from the name's own bucket in the pool, else either.
- `serialize(): SimulationSave` / `restoreSimulation(input, save)`: persists the instanced set, flags and reservations; restore with identical inputs reproduces the exact state.

## Errors
Closed set, thrown as `SimulationError { code, message, details? }` ([src/schemas/errors.ts](src/schemas/errors.ts)):
- `E_INVALID_INPUT`: input or a radius scope fails validation; message names the field.
- `E_UNKNOWN_ID`: npc, parcel, district, edge, stop or line id not found.
- `E_STALE_HANDLE`: crowdId not alive at the given time.
- `E_NO_MATCH`: no NPC can satisfy the query or reservation.
- `E_DEAD`: behavior or flag operation on a dead NPC.
- `E_CONFLICT`: reservation or flag conflicts with already-instantiated state.
- `E_TIME`: time outside the supported range.

## Invariants
- Same seed and inputs: identical populationStats and crowd for any query order.
- Calibration: the blueprint's `stats.population` is the world's truth. Residents match it within 3 percent by scaling the housing stock estimated from residential floor area (units per parcel) by one factor, published as `calibrationFactor`; occupancy stays at `params.occupancyRate`. The factor is 1 when the blueprint carries no figure (0) or the estimate already agrees; a stock too coarse to land inside the band gets the closest achievable count.
- Every blueprint district appears in populationStats.perDistrict and is a valid crowd scope, residents or not; districts without residents still carry their working population in crowds.
- Same seed and same interaction order: identical instanced population.
- Gender: every instance carries `male` or `female`, fixed for an npc id whether the person is instanced or still a family stub. Singles, lone parents, roommates and kids draw individually against `params.femaleShare` (default 0.51). A couple is one draw per household instead: mixed-gender unless the household falls in `params.sameGenderCoupleShare` (default 0.03, the city rate in docs/RESEARCH.md), so the pair reads the same whichever partner is instantiated first. Paired adults come out near 50/50 by construction, so the whole-population female share sits a few tenths below `femaleShare`. The given name comes from that gender's bucket, falling back to `neutral` and then to the whole pool when a bucket is empty, so a generated name and its gender always agree wherever the pool tags them. A crowd agent carries the same gender: parcel agents read their worker's, street and stop agents draw it from their own stream and instantiate only into a person of that type and gender.
- Conservation: instanced NPCs never contradict aggregate stats; an assigned home unit, job slot or crowd identity is never reassigned; an instance never changes identity, home or family except through applyFlag.
- Cost: crowd() and instantiate() cost does not grow with total population; full computation only for instanced NPCs.
- Staffing is a rota: posts (people on duty at once) x waves (shifts tiling the open span) x day crews (five days each, no overlap). An open place is staffed and vendor-queryable at every minute of its opening hours on every day it opens, with the same headcount on a Sunday as on a Tuesday, and empty when closed. Interior role [min, max] counts set the posts; 24/7 places get three waves plus security; night-only places staff night shifts; every staffed job maps to an employed resident with a commute.
- When a city has more job slots than employed residents, slots fill breadth-first: every workplace's opening rota before any workplace's deeper slots, so small venues stay open and large employers carry the shortfall.
- Street presence: the share of the population out in public space by hour is calibrated to time-use and travel statistics (docs/RESEARCH.md) and multiplied by `params.streetDensity` (default 1, the researched share). Presence is spread across districts and street edges by land-use pull, so commercial frontage carries more people than a bypass of the same length.
- Standalone: runs against fixture blueprints with no other layer present.

## Depends on
- ../atlas/CONTRACT.md (blueprint v0.2)
- ../connections/CONTRACT.md (networks.schema.json: walk + transit slice)
- ../interior/CONTRACT.md (npc.schema.json)
- ../naming/CONTRACT.md (npc-types.schema.json, name pool with `givenByGender`)
