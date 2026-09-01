# Changelog

0.1: statistical population with lazy deterministic instantiation. Aggregate demographics from real statistics, crowd layer with instantiable handles, full NPC lives (home, job, shift, family, bus line, weekly routine), interior-anchored behavior states, flags, reservations, persistence, 2D testbed.

0.2: crowd() returns a deterministic capped agent sample for every scope kind (maxAgents option, default 64); parcel agents are the on-duty workers and resolve to those exact NPCs; every blueprint district is on the surface, industrial districts carry their working population in crowds.

0.2.1: crowd() sampled path runs sub-millisecond warm on 8000-edge, 50k-resident cities (district group tables memoized per timestamp, per-edge counts via numeric hashing); maxAgents 0 is a pure count path with no sampling cost.

0.2.2: testbed frontend lives in src/ui (views, widgets, components, one adapter over the library surface), with its own contract; npm run testbed builds it into testbed/ and serves http://localhost:8080/testbed/.

0.4: every NPC instance carries a gender, drawn against `params.femaleShare` (default 0.51) and fixed per npc id, so a family stub and its full instance always agree. The given name is drawn from that gender's bucket in naming's `givenByGender` pool, falling back to neutral and then to the whole list, so an untagged or all-neutral theme still names everyone. `reserveNPC` takes an optional gender, otherwise reading it from the fixed name's bucket. The testbed card shows the gender beside the type.

0.3: staffing is a rota (posts x shift waves x day crews), so an open place has staff and a queryable vendor at every minute of its opening hours, every day it opens, with interior role counts setting the on-duty headcount; job slots fill breadth-first, opening shifts of every workplace before deeper slots, so small venues stay staffed when a city has more slots than workers. Street presence is calibrated to time-use and travel statistics (weekday peak ~15% of the population outdoors, midday bump, evening tail, quiet night; flatter weekend plateau), errand and leisure trips land where the land use pulls them, kids count as street life, and `params.streetDensity` scales the whole curve.
