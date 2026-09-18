# Simulation 0.9.2

Computes statistical crowds and persistent NPC identities, assignments and logical schedules during gameplay.

## Boundary

Synchronous TypeScript library, imported from `@urbe/simulation`. The host supplies prepared inputs, game time and storage; there is no clock, I/O, ambient randomness or LLM. Creation prepares inputs; Engine owns runtime use. Meters, +Y up, XZ ground, CCW polygons. Time is finite nonnegative minutes since Monday 00:00; weeks repeat. Use whole minutes for crowd trip spans; continuity accepts fractional minutes.

## Inputs and calls

`createSimulation(input)` or `new CitySimulation(input)` returns a state owner. [SimulationInput](src/schemas/input.ts) requires `seed` and `blueprint`; optional fields and defaults are in [SKILL.md](SKILL.md).

| Input | Schema | Omission |
| --- | --- | --- |
| Blueprint | [CityBlueprint](src/schemas/blueprint.ts) | Required |
| Networks | [Networks](src/schemas/networks.ts) | Blueprint streets and estimated transit; exact commute projection needs walk geometry |
| Interiors | [NpcSupport](src/schemas/interiors.ts), keyed by parcel ID | Synthetic building roles |
| NPC types, name pool | [NPCTypeSet, NamePool](src/schemas/npc-types.ts) | Built-in types; names use explicit pool, embedded pool, then built-in pool |
| Parameters | [SimulationParams](src/schemas/params.ts) | Statistical defaults; `shiftMix` is accepted but unused |

| Call | Input | Output |
| --- | --- | --- |
| `populationStats()` | None | [PopulationStats](src/schemas/population.ts): initial residents, households, adult employment/type counts, district/tier totals, calibration factor and type gaps |
| `crowd(timeMin, scope, opts?)` | [CrowdScope, CrowdOpts](src/schemas/crowd.ts) | [CrowdSlice](src/schemas/crowd.ts): group counts and render candidates |
| `instantiate(handle)` | [InstantiateHandle](src/schemas/input.ts): crowd ID/time, NPC ID or vendor query | [NPCInstance](src/schemas/npc.ts) |
| `getNPC(npcId)` | Established ID | NPCInstance |
| `getNPCVendor(query)` | [VendorQuery](src/schemas/npc.ts): time, optional parcel/type/role | On-duty allocated NPCInstance |
| `reserveNPC(spec)` | [ReservedSpec](src/schemas/npc.ts): name/type, optional gender/home district/job parcel/role | Allocated NPCInstance with fixed name |
| `findNPCs(query)` | [NPCQuery](src/schemas/npc.ts): type/home district/home or job parcel/custom flag/includeDead | Matching established NPCInstance[]; dead excluded by default |
| `behaviorAt(npcId, timeMin)` | Established ID/time | [BehaviorState](src/schemas/npc.ts): logical place, activity, Interior anchor intent and interruption |
| `continuityAt(npcId, timeMin)` | Established ID/time | [NPCContinuityState](src/schemas/npc-continuity.schema.json): schedule progress, next destination, animation and available walk path |
| `interrupt(npcId, timeMin)` / `resume(npcId, timeMin)` | Established ID/time | `void`; interrupt freezes projection at that minute; resume returns to the schedule at the query time |
| `applyFlag(npcId, op)` | [FlagOp](src/schemas/npc.ts): resign/promote/die/custom | `void`; mutate the established record and record the event |
| `serialize()` | None | [SimulationSave](src/schemas/simulation-save.schema.json), version `"1"` |
| `restoreSimulation(input, save)` / `sim.restore(save)` | Same compatible prepared inputs and ordered save | New CitySimulation / `void` replay into the instance |

Returned records belong to the simulation; callers must not mutate them. Replay a save into a newly constructed instance. The save contains seed and events, not the prepared world or input fingerprints.

## Semantics and limits

- Same seed and prepared inputs produce the same initial counts. Identity and appearance depend on ordered establishment events; replay reproduces them. Statistical baselines do not recompute after flags.
- Calibration searches for residents within 3% of a positive blueprint population. Coarse housing and the bounded factor search can miss that target. Zero means use the housing estimate. `unemployed` counts all adults without allocated jobs, including those outside the labor force.
- City/district groups describe street presence; agents sample streets. Edge/stop/parcel groups tally their candidates. `maxAgents` defaults to 64; zero returns counts only. Radius returns all street/stop candidates in its circle and ignores the cap; it excludes building interiors.
- An anonymous edge/stop handle names one trip with inclusive whole-minute bounds. Edge trips do not continue across edges. Once established, its handle resolves to the same person after the trip. Post handles identify allocated workers. Appearance persists with the identity.
- Household and initial job assignments use unique statistical slots. Family references can be instantiated. Themed `type` and Interior `job.role` are separate vocabularies. Building employment is `job`; station/route employment is `transitJob`.
- Staffing uses posts, shift waves and day crews. Filled slots supply vendors; insufficient workers leave vacancies. Reservation uses bounded seeded probes and can miss a rare feasible match.
- Resign clears employment and rebuilds the routine. Promote assigns an executive schedule at the target or current building; it does not move the home or allocate a destination post. Die excludes the person from vendor/default identity searches. Crowd post counts keep the initial allocation.
- Walking projects shortest network paths from authoritative `path3`; absent paths raise `E_NO_MATCH`. Endpoint selection can use the nearest network node. Interior output is anchor intent, not verified local travel. The host owns physical motion and interruption release travel.
- Initialization stores household prefix counts; cold statistics scan adults and crowd initialization scans job slots. Sampled queries scan relevant edges; candidate enumeration and rare-type identity search can grow with population. No persistent-person cap or accepted timing budget is implemented.

Cross-box changes and open policies: [docs/ISSUES.md](docs/ISSUES.md).

## Errors

Closed domain set: [SimulationError](src/schemas/errors.ts), with `code`, `message`, optional `details`. Inputs must satisfy the TypeScript schemas; runtime admission checks are partial.

| Code | Meaning |
| --- | --- |
| `E_INVALID_INPUT` | Failed construction, radius or save validation, including seed mismatch |
| `E_UNKNOWN_ID` | Unknown/unavailable NPC, district, walking edge, stop or workplace parcel |
| `E_STALE_HANDLE` | Unbound crowd handle has no trip at the supplied time |
| `E_NO_MATCH` | No queried worker, probed reservation, free matching person or authoritative commute route |
| `E_DEAD` | Behavior, continuity, interrupt or flag operation on a dead person |
| `E_CONFLICT` | Probed reservation already claimed, or resignation/promotion lacks required employment |
| `E_TIME` | `crowd`, vendor, behavior or continuity query receives a negative or non-finite time |

## Dependencies

Data contracts only, no sibling runtime imports: [Atlas](../atlas/CONTRACT.md) blueprint, [Connections](../connections/CONTRACT.md) networks, [Interior](../interior/CONTRACT.md) NPC support, [Naming](../naming/CONTRACT.md) type/name catalogs. Local schemas define the consumed projections; the host checks compatible producer versions. Engine and Quests consume the library; Naming may consume population statistics.
