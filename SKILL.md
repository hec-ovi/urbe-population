---
name: urbe-simulation
description: Call the Urbe Simulation library for gameplay crowd counts, persistent people, quest cast, logical continuity and replay saves from prepared city data.
---

# Simulation 0.10.1

Computes statistical crowds and persistent people from prepared city inputs and explicit gameplay time.

## Call

Build with `npm run build`, then import from `@urbe/simulation` (or `./dist/index.js` inside this repo). Use `createSimulation(input)` when gameplay loads, or `restoreSimulation(input, save)` with compatible saved inputs. There is no simulation CLI or HTTP server. Creation prepares data; the host drives time and saves.

## Request

[SimulationInput](src/schemas/input.ts): `seed` (string/number) and `blueprint` required. Optional `networks` supplies walk `path3` and transit; `interiors` maps parcel IDs to NPC support; `npcTypes` defaults to built-in types. `namePool` overrides the type set's pool, which otherwise supplies names. Omitted networks use blueprint crowd/timetable fallbacks; omitted interiors use synthetic roles, not playable room geometry.

Optional [params](src/schemas/params.ts):

| Field | Default | Meaning |
| --- | --- | --- |
| `occupancyRate` | 0.55 | Occupied housing fraction, `(0,1]` |
| `unemploymentRate` | 0.041 | Labor-force unemployment fraction, `(0,1]` |
| `femaleShare` | 0.51 | Gender draw fraction, `[0,1]` |
| `sameGenderCoupleShare` | 0.03 | Couple composition fraction, `[0,1]` |
| `householdMix` | single .29, couple .27, coupleKids .21, singleParent .10, shared .13 | Relative weights; omitted members keep defaults |
| `shiftMix` | No effect | Accepted compatibility input; staffing determines shifts |
| `streetDensity` | 1 | Nonnegative multiplier on modeled public presence |
| `defaultHeadwayMin` | 12 | Estimated transit headway in minutes |
| `maxInstances` | 100 | Most established people held at once; an integer of 1 or more |

Supply finite values, nonnegative weights with a positive total, and a positive headway. Admission checks are partial. Geometry is meters, +Y up, XZ ground. `timeMin` is minutes since Monday midnight; weeks repeat. Prefer whole minutes for crowd handles; continuity supports fractions.

## Response and errors

The returned `CitySimulation` exposes counts through `populationStats()` and `crowd(timeMin, scope, {maxAgents:64})`. Scope is city, district, edge, stop, parcel, or `{kind:'radius',x,z,metres}`. A parcel returns the posts on duty at that minute plus the guests inside an open venue. ID scopes take `id`; radius is uncapped and excludes interiors. Keep a displayed agent's `crowdId` and inclusive `trip` bounds; pass its exact handle/time to `instantiate`.

`instantiate`, `getNPCVendor`, and `reserveNPC` return persistent `NPCInstance` records, each with a name, gender, age and two to four traits; `getNPC` and `findNPCs` read established people. `populationStats` reports `instances` against `capacity`. `behaviorAt`/`continuityAt` project their schedule. `interrupt`/`resume` freeze/release logical time; `applyFlag` accepts resign, promote, die or a custom tag. `serialize()` returns replay save version `"1"`. Treat returned records as read-only. [CONTRACT.md](CONTRACT.md) links every query, result and save schema and states current limits.

Catch `SimulationError` by code: `E_INVALID_INPUT` (admission), `E_UNKNOWN_ID` (missing entity), `E_STALE_HANDLE` (expired unbound trip), `E_NO_MATCH` (unavailable person or missing walk `path3`), `E_DEAD` (behavior, continuity, interrupt or flag on a dead person), `E_CONFLICT` (claimed allocation or employment conflict), `E_CAPACITY` (a new person past `maxInstances`), `E_TIME` (negative or non-finite crowd, vendor, behavior or continuity time).

## Worked example

From the repo root after building:

```sh
node --input-type=module <<'JS'
import { createSimulation, restoreSimulation, FIXTURE_BLUEPRINT,
  FIXTURE_INTERIORS, SimulationError } from './dist/index.js';

const input = { seed: 42, blueprint: FIXTURE_BLUEPRINT, interiors: FIXTURE_INTERIORS };
try {
  const sim = createSimulation(input);
  const person = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: 540 });
  const state = sim.continuityAt(person.npcId, 570);
  const saved = sim.serialize();
  const loaded = restoreSimulation(input, saved);
  console.log({ npcId: person.npcId, name: person.name,
    activity: state.behavior.activity, saveVersion: saved.version,
    restored: loaded.getNPC(person.npcId).npcId === person.npcId });
} catch (error) {
  if (!(error instanceof SimulationError)) throw error;
  console.error(error.code, error.message);
  process.exitCode = 1;
}
JS
```

This resolves a working cafe employee, projects their local routine and restores the same identity. A complete walking journey additionally requires prepared network and Interior handoffs.
