# Changelog

0.9.0: an instanced NPC keeps the appearance seed of the crowd body that became that person. `continuityAt` projects the exact weekly entry, progress, next destination and animation, with commute routes built only from Connections `path3`. Interruptions freeze that projection, and save restore reproduces the same identity, body traits and progress.

0.8.0: rail stations carry platform and fare staff through their service hours, and every bus, train and subway route carries enough drivers for its round trip and headway. Building workers keep `job.parcelId`; station and vehicle workers use `transitJob`. Type gaps keep `parcelTypes` and add `nonParcelPlaces` when the missing category affects a station or route.

0.7.0: a worker's type and the post they hold agree. The post's role picks the type categories that may fill it, best first (a vendor role from vendor types, a service or reception post from vendor then worker types, a guard post from authority then worker types), and grounding narrows before the category widens, so a themed set staffs its harbour crane operator at the factory and its mall vendor at the counter instead of behind a coffee machine. `populationStats().typeGaps` names any role the set has no admitting category for, and transit types hold no parcel post.

0.6.4: the blueprint slice is verified against atlas 0.7.0 and declares only what the population reads: districts, street edges with their sidewalk widths, parcels, transit and stats. Street class, level, nodes and crossings belong to the host that draws the city, so a new atlas street class such as `alley` needs no change here; pedestrians follow sidewalk width, and a highway deck carries none.

0.6.3: the contract states where a worker's type and role each come from. The type is naming's, grounded on the parcel type, so a coffee shop staffs baristas; `job.role` is the interior's own role name for the post when the parcel ships an NpcSupport, so a `role` filter on getNPCVendor matches the interior's vocabulary and nothing else.

0.6.2: a trip's stated span is inclusive on both ends. `trip.endMin` is the last whole minute the body is on its edge, at its stop or on shift, so a handle read at 780 instantiates at 780 and 781 and the next body of that slot starts at 782. Consumers that hold a person until `endMin` keep them for the whole trip instead of losing the final minute.

0.6.1: a street or stop handle resolves to a real free person of its type and gender. Seeded probes prefer someone whose routine has them outdoors at that minute; when the type is too rare for the probes to land on, one pass over the adult index takes the first free match, so the village's two police officers instantiate whenever one is free and E_NO_MATCH means the city has nobody.

0.6: a crowd handle names one trip. A street slot runs back-to-back traversals of its edge at walking pace and a stop slot 8 minute waits, staggered so trips start at every minute, each typed and counted at its own start minute; the same crowdId comes back on every poll with progress advancing in its direction, `agent.trip` states the span, instantiate resolves the handle at any minute of the trip and, once instantiated, at any time. Parcel agents state their on-duty span the same way.

0.5: crowd() takes a radius scope `{ kind: 'radius', x, z, metres }` returning every street and stop agent inside the circle with no cap (city and district scopes keep maxAgents); residents are calibrated to the blueprint's stats.population within 3 percent by scaling the estimated housing stock, with the factor published as populationStats().calibrationFactor; every crowd agent carries the gender its handle resolves to on instantiation.

0.4.1: a couple's gender composition is one household-level draw, keyed by household id and so identical whichever partner is instantiated first. `params.sameGenderCoupleShare` (default 0.03, the city rate in docs/RESEARCH.md) sets how many couples share a gender; singles, lone parents, roommates and kids keep the individual `params.femaleShare` draw.

0.4: every NPC instance carries a gender, drawn against `params.femaleShare` (default 0.51) and fixed per npc id, so a family stub and its full instance always agree. The given name is drawn from that gender's bucket in naming's `givenByGender` pool, falling back to neutral and then to the whole list, so an untagged or all-neutral theme still names everyone. `reserveNPC` takes an optional gender, otherwise reading it from the fixed name's bucket. The testbed card shows the gender beside the type.

0.3: staffing is a rota (posts x shift waves x day crews), so an open place has staff and a queryable vendor at every minute of its opening hours, every day it opens, with interior role counts setting the on-duty headcount; job slots fill breadth-first, opening shifts of every workplace before deeper slots, so small venues stay staffed when a city has more slots than workers. Street presence is calibrated to time-use and travel statistics (weekday peak ~15% of the population outdoors, midday bump, evening tail, quiet night; flatter weekend plateau), errand and leisure trips land where the land use pulls them, kids count as street life, and `params.streetDensity` scales the whole curve.

0.2.2: testbed frontend lives in src/ui (views, widgets, components, one adapter over the library surface), with its own contract; npm run testbed builds it into testbed/ and serves http://localhost:8080/testbed/.

0.2.1: crowd() sampled path runs sub-millisecond warm on 8000-edge, 50k-resident cities (district group tables memoized per timestamp, per-edge counts via numeric hashing); maxAgents 0 is a pure count path with no sampling cost.

0.2: crowd() returns a deterministic capped agent sample for every scope kind (maxAgents option, default 64); parcel agents are the on-duty workers and resolve to those exact NPCs; every blueprint district is on the surface, industrial districts carry their working population in crowds.

0.1: statistical population with lazy deterministic instantiation. Aggregate demographics from real statistics, crowd layer with instantiable handles, full NPC lives (home, job, shift, family, bus line, weekly routine), interior-anchored behavior states, flags, reservations, persistence, 2D testbed.
