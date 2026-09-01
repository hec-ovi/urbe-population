# Changelog

0.1: statistical population with lazy deterministic instantiation. Aggregate demographics from real statistics, crowd layer with instantiable handles, full NPC lives (home, job, shift, family, bus line, weekly routine), interior-anchored behavior states, flags, reservations, persistence, 2D testbed.

0.2: crowd() returns a deterministic capped agent sample for every scope kind (maxAgents option, default 64); parcel agents are the on-duty workers and resolve to those exact NPCs; every blueprint district is on the surface, industrial districts carry their working population in crowds.

0.2.1: crowd() sampled path runs sub-millisecond warm on 8000-edge, 50k-resident cities (district group tables memoized per timestamp, per-edge counts via numeric hashing); maxAgents 0 is a pure count path with no sampling cost.

0.2.2: testbed frontend lives in src/ui (views, widgets, components, one adapter over the library surface), with its own contract; npm run testbed builds it into testbed/ and serves http://localhost:8080/testbed/.
