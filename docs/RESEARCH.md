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
- Sex ratio (UN WPP 2024, national censuses): city populations sit close to even and tilt slightly female because women live longer; 51% female is the default (`params.femaleShare`), and a theme can move it.
- Couple composition (US Census Bureau, "Where Same-Sex Couples Live", ACS 2017, and CPS ASEC 2019): same-sex couples are 0.8% of all US households nationally and 3.0% in San Francisco, the highest city; coupled households are about 70 million of 128 million, so as a share of couples that is ~1.4% nationally and ~5.5% in the top city. This layer models a city, so `params.sameGenderCoupleShare` defaults to 0.03. The same source puts 51.7% of same-sex couple households as female couples, which the 51% sex ratio already produces when the couple's shared gender is drawn. Partner gender is therefore a household-level draw, not two independent ones; with independent draws about half of all couples would come out same-gender.
- Consequence of that draw: paired adults are near 50/50 by construction, so the female surplus sits in the single, lone-parent and roommate population and the whole-population female share lands a few tenths below `femaleShare` (0.507 measured against a 0.51 target). Real populations work the same way: the surplus is concentrated in the older, mostly unpartnered cohort.
- Labor (ACS/BLS 2024-26): of adults, 64% in labor force; unemployment ~4.1%; 36% not in labor force (retirees, students, carers) and they need daytime whereabouts too.
- Shifts (BLS ATUS): 16% non-daytime usual schedule: 6% evening, 4% night, 6% rotating/other. Concentrated in hospitality (37%), transport/utilities (26%), retail (25%), protective services (47% any overnight).
- Departure times (ACS B08302): 14-bucket curve, peak 7:00-7:29 at 14.3%; 5.5% leave between midnight and 5 a.m.
- Commute mode (ACS 2024): bus 1.7%, subway 1.5% nationally; transit-heavy cities run 15-30% (Vienna 29.8%), so mode shares are per-city params with a transit-city default.
- 24/7 staffing: one continuously staffed post = 168h / 40h = 4.2 FTE, x1.15-1.25 relief = 5-6 people; a venue with counter + security posts needs ~10 distinct employees.
- Rota shape: a place is staffed by posts (people on duty at once), waves (shift windows tiling the open span, 8 h at most) and day crews (5 working days each, ILO/BLS full-time norm), so employees = posts x waves x crews. A 24/7 post lands on 3 x 2 = 6 people, matching the FTE arithmetic above; a shop open 12 h, 7 days lands on 2 x 2 = 4 per post.

## Street presence (2026-09-01)
How much of a city is out in public space at hour H, and where.

- Time-location budget (NHAPS, Klepeis et al. 2001, n=9386): 87% of the day indoors, ~6% in an enclosed vehicle, ~7% outdoors. Employed people: 92% indoors, 6% in transit, 2% outdoors.
- Trip counts: 3.4 trips per person per day (NHTS 2017), 2.9 in Germany (MiD 2023) with 84 min of daily travel; ~3.5 trips and ~80 min across EU cities (OPTIMISM 2022).
- Trip timing (NHTS, BTS Daily Travel Quick Facts): noon-13:00 carries 7.4% of daily trips, more than the 8-9:00 commute peak at 5.5%. Non-motorized travel has four peaks (08:00, noon, 15:00, 18:00) against three for motorized. Weekend curves are flatter, start later and have no sharp morning peak (Swiss HTS via MATSim Zurich, 2025).
- Pedestrian counts: Kendall Square, Cambridge (Sevtsuk, JAPA 2021, 60 segments) averages ~436 pedestrians per segment-hour at midday and ~428 in the evening window: the evening is longer, not denser. Copenhagen's Stroget carries ~54,000 pedestrians per 12 h (Gehl public-life surveys).
- Comfort ceiling (Fruin 1971, the source of the HCM pedestrian tables): level of service A is above 3.3 m2 per pedestrian, B 2.3-3.3, C 1.4-2.3, and crowding starts near 23 pedestrians per minute per metre (13 by Copenhagen norms). A 90 m radius holding ~600 m of 3 m pavement is still LOS A at 170 people, so a lively street stays far below the crowding threshold.

Calibration used (src/crowd/presence.ts). The published outdoor curve peaks near 11% of the population at 17:00-18:00, dips to 5.5-6% mid-morning and mid-afternoon, and averages ~5% over the day. This world has no private car traffic layer, so trips made by car appear as people on the street too: presence is set ~1.4x the published outdoors-only curve (still under the outdoors-plus-vehicle 13% ceiling), giving a weekday peak near 15% of the population, ~10-11% at midday, ~6% at 21:00 and ~1% overnight; the weekend runs as a flat 11-12% plateau from late morning to early evening. `params.streetDensity` multiplies the whole curve for hosts that want a busier or quieter city.

Where they walk: pedestrian volumes track the land use fronting the pavement, so each street edge carries a share of its district proportional to length times the pull of the doors within 60 m of it (retail and food 3-4, offices and clinics 1.5, homes 0.6, industry 0.3-0.5), and errand and leisure trips are spread across districts by that same pull rather than kept at home.

## Behavior and scheduling
Hand-rolled discriminated-union FSMs (XState is a 2.3 MB actor framework, wrong tool; robot3 the fallback if declarative authoring ever matters). Instanced NPCs advance by discrete events (arrive work 08:00, board 16:12 bus), not ticks; the aggregate layer needs no scheduler at all: it is closed-form per (time, place, type). Routine schema borrowed from activity-based travel demand (ActivitySim/MATSim): a day is a list of (activity, place, start, duration, mode).

## Known limit to respect
Lazy conditioning is only proven for observed trajectories; two instanced NPCs whose stories cross-reference (same employer, family) turn it into incremental constraint satisfaction that no shipped system fully solves. Mitigation: all cross-referenced facts (job slots, home units, family members) are allocated through the one registry with Feistel-unique slots, so instances can never contradict each other; family members are stubs instantiated through the same registry.
