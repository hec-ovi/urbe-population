# Research conclusions (2026-08-31)

Deep dive on crowd simulation at scale, population synthesis and lazy LOD instantiation. Sources and full findings live in the research store; this is what the box builds on.

## Architecture: alibi generation
The problem has a named solution: alibi generation (Sunshine-Hill and Badler, AIIDE 2010) and its shipped analogue, the Census system behind Watch Dogs: Legion's "play as anyone" (GDC 2021, credits the paper). Crowds are a closed-form statistical function (who is on segment S at hour H, by type); an individual gets a full consistent life only on interaction, generated to stay consistent with what was already observed; once generated it persists forever. Measured costs in the paper: 20k agents, 52 kB precomputed state, ~9 ms per instantiation. We store only the instanced set, never a population table.

## Determinism: event-keyed hash RNG
Sequential PRNGs cannot give order-independent results (formalized in arXiv 2603.11084, 2026): any control-flow change shifts every later draw. Instead every draw is a pure function `hash(seed, attributeTag, entityId) -> sfc32 stream`. sfc32 + xmur3-style hash is the best JS choice (passes PractRand/BigCrush, `Math.imul` only, ~15 lines); no maintained npm package offers this API, so it is hand-rolled, zero dependencies. Consequence made explicit in the contract: stable NPC ids are a determinism obligation.
JS trap: `Math.pow`, trig, `exp/log` are implementation-approximated per ECMA-262, and array sort stability details vary. Generation path uses integer and basic float arithmetic only, and never relies on sort for tie-breaking.

## Unique assignment: Feistel bijection
Homes and job slots must be unique without bookkeeping: a 4-round Feistel permutation over the slot index space (cycle walking for non-power-of-two counts) gives an O(1), stateless, collision-free mapping npc-index -> slot (EA SEED technique). Names skip this: plain hash into the pool, repeats are by design.

## Population synthesis: sample-free hierarchical sampling
IPF and friends need microdata samples and materialize whole tables; the sample-free branch (Barthelemy and Toint 2013, 10M individuals for Belgium from marginals only) draws attributes in a fixed conditional order, which is exactly a lazy per-NPC generator. Our chain: district+tier -> household form -> employment -> workplace -> shift -> commute mode.

## Statistical defaults (in src/population/defaults.ts)
- Households (ACS 2024): 1p 28.9%, 2p 34.2%, 3p 15.3%, 4p 12.3%, 5p 5.7%, 6p 2.2%, 7+ 1.5%; average 2.50.
- Labor (ACS/BLS 2024-26): of adults, 64% in labor force; unemployment ~4.1%; 36% not in labor force (retirees, students, carers) and they need daytime whereabouts too.
- Shifts (BLS ATUS): 16% non-daytime usual schedule: 6% evening, 4% night, 6% rotating/other. Concentrated in hospitality (37%), transport/utilities (26%), retail (25%), protective services (47% any overnight).
- Departure times (ACS B08302): 14-bucket curve, peak 7:00-7:29 at 14.3%; 5.5% leave between midnight and 5 a.m.
- Commute mode (ACS 2024): bus 1.7%, subway 1.5% nationally; transit-heavy cities run 15-30% (Vienna 29.8%), so mode shares are per-city params with a transit-city default.
- 24/7 staffing: one continuously staffed post = 168h / 40h = 4.2 FTE, x1.15-1.25 relief = 5-6 people; a venue with counter + security posts needs ~10 distinct employees.

## Behavior and scheduling
Hand-rolled discriminated-union FSMs (XState is a 2.3 MB actor framework, wrong tool; robot3 the fallback if declarative authoring ever matters). Instanced NPCs advance by discrete events (arrive work 08:00, board 16:12 bus), not ticks; the aggregate layer needs no scheduler at all: it is closed-form per (time, place, type). Routine schema borrowed from activity-based travel demand (ActivitySim/MATSim): a day is a list of (activity, place, start, duration, mode).

## Known limit to respect
Lazy conditioning is only proven for observed trajectories; two instanced NPCs whose stories cross-reference (same employer, family) turn it into incremental constraint satisfaction that no shipped system fully solves. Mitigation: all cross-referenced facts (job slots, home units, family members) are allocated through the one registry with Feistel-unique slots, so instances can never contradict each other; family members are stubs instantiated through the same registry.
