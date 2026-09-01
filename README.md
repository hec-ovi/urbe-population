# @urbe/simulation

Statistical NPC population for the urbe city world. Thousands of NPCs appear to live full lives; a specific NPC is only fully computed when the player interacts with it, and from that moment it is persistent. Same seed and same interaction order give the same population.

## Layers

- Aggregate: per-district demographics (households, employment, shifts) derived from real statistics (ACS households and commuting, BLS shift prevalence), as pure functions of the seed.
- Crowd: typed counts and cheap pseudo-agents per street edge, stop or district at any time. A crowd agent's id is the handle that instantiates it.
- Instancing: on interaction an NPC gets a home unit, job with shift, family, name and a gapless weekly routine including its exact bus line, all deterministic. 24/7 places staff three shifts plus security (about 5 employees per continuous post).
- Behavior: a state snapshot per time; inside a building the NPC runs the interior layer's routine anchors. Interruptible and resumable.
- Flags and quests: resign, promote, dead, custom tags; pre-instanced reservations; serialize and restore.

## Use

```ts
import { createSimulation, FIXTURE_BLUEPRINT, FIXTURE_INTERIORS } from '@urbe/simulation';

const sim = createSimulation({ seed: 42, blueprint: FIXTURE_BLUEPRINT, interiors: FIXTURE_INTERIORS });
const barista = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: 9 * 60 });
const state = sim.behaviorAt(barista.npcId, 9 * 60 + 30);
```

CONTRACT.md is the full surface. Real inputs come from the atlas, connections, interior and naming layers; the bundled fixtures make it run standalone.

## Commands

- `npm test`: contract tests
- `npm run build`: compile to dist/
- `npm run testbed`: build the 2D preview, then serve the repo root (`python3 -m http.server`) and open /testbed/

docs/RESEARCH.md holds the research conclusions the design stands on.
