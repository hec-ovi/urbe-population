# urbe-population

Statistical NPC population for a whole city, as an embeddable TypeScript library. Thousands of people appear to live full lives while costing almost nothing; a specific NPC is computed in full only when a player interacts with it, and from that moment it is persistent. Same seed and same interaction order give the same population.

No LLM, no wall clock, no IO. Aggregate answers are pure functions of the inputs and the time, identical whatever order they are asked in.

## Run

```
npm install
npm test          # contract tests
npm run build     # compile to dist/
npm run testbed   # build the 2D preview, then serve the repo root and open /testbed/
```

## In

```ts
import { createSimulation, FIXTURE_BLUEPRINT, FIXTURE_INTERIORS } from '@urbe/simulation';

const sim = createSimulation({ seed: 42, blueprint: FIXTURE_BLUEPRINT, interiors: FIXTURE_INTERIORS });
const barista = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: 9 * 60 });
const state = sim.behaviorAt(barista.npcId, 9 * 60 + 30);
```

A seed plus a city blueprint (districts, parcels with type and tier, transit). Optional inputs sharpen it: movement networks with timetables, per-building NPC support files (roles with min and max counts, routine anchors), a themed NPC type set, a name pool, and statistical overrides. Every optional input has a built-in fallback, so it runs on the bundled fixtures with nothing else present.

Time is integer minutes since a Monday midnight epoch; routines repeat weekly.

## Out

- **`populationStats()`**: residents, households, employment and NPC type counts per district and tier.
- **`crowd(time, scope)`**: typed counts for a city, district, street edge, transit stop or parcel, plus a deterministic capped sample of agents. Every agent id is a handle that instantiates that exact person; parcel agents are the on-duty workers.
- **`instantiate(handle)` / `getNPCVendor(query)` / `findNPCs(query)`**: a full NPC life, conditioned on everyone already instantiated. Home unit, job with shift, family, name, bus line, and a gapless weekly routine.
- **`behaviorAt(npcId, time)`**: where that person is and what they are doing right now, as an interior anchor step, a walk intent, a street edge, a transit leg or home.
- **`interrupt` / `resume`**: player interaction pauses a routine and puts it back.
- **`applyFlag`**: resign, promote (which reassigns the job and moves the home when the tier changes), die, or custom tags. Dead NPCs stop matching vendor and quest queries.
- **`reserveNPC(spec)`**: a story-critical NPC with a fixed name and type, taking a real statistical slot.
- **`serialize()` / `restoreSimulation()`**: persistence. Restoring with the same inputs reproduces the exact state.

Conservation holds throughout: an instanced NPC never contradicts the aggregate stats, a home unit or job slot is never handed out twice, and an identity never changes except through a flag. The cost of `crowd()` and `instantiate()` does not grow with the total population; a sampled crowd query runs sub-millisecond warm on an 8000 edge, 50k resident city.

## How it works

- **Aggregate**: per-district demographics (households, employment, shift prevalence) derived from real statistics, ACS households and commuting plus BLS shift data, as pure functions of the seed.
- **Crowd**: typed counts and cheap pseudo-agents per street edge, stop, parcel or district at any minute. A crowd agent's id is the handle that instantiates it.
- **Instancing**: on interaction the NPC gets its life. Staffing honors each building's role counts: a 24/7 place gets three shifts plus security, a night-only place gets night shifts, and every staffed job maps to an employed resident with a commute.
- **Behavior**: a state snapshot per time. Inside a building the NPC runs the interior layer's routine anchors; the host owns the path geometry.

`docs/RESEARCH.md` holds the statistics the defaults stand on, and `CONTRACT.md` is the full surface with its closed error set.

## In the urbe family

It reads the city plan from [urbe-atlas](../urbe-atlas), movement networks from [urbe-transit](../urbe-transit), building routines from [interiorforge](../interiorforge), and NPC types from [urbe-namer](../urbe-namer). [urbe-quests](../urbe-quests) queries it for cast, and [urbe-engine](../urbe-engine) hosts it and renders whatever it says is on the street. The full picture lives in [urbe](../urbe).
