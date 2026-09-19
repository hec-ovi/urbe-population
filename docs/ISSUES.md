# Open questions

Orchestrator coordination. Public inputs, outputs and error codes stay as [CONTRACT.md](../CONTRACT.md).

| Question | Why it is open | Boxes |
| --- | --- | --- |
| Persistent capacity | `params.maxInstances` caps established people at 100 by default and refuses with `E_CAPACITY`. Agree the gameplay maximum, eviction of people nobody watches, and a reserved share for quests. | Simulation, Engine, Quests |
| Observation continuity | Edge handles end after one traversal. Outdoor fallback matches type/gender without the observed destination. | Simulation, Engine, Quests |
| Person facts | Records expose home unit, family, employment, routines, age and traits. Agree floor/apartment, biography and who publishes them. | Simulation, Interior, Naming, Quests, Engine |
| Post occupancy | Parcel crowd uses initial slots after death or resignation. Need post/shift IDs and a mapping to Interior placements. | Simulation, Interior, Engine, Quests |
| Staffing feasibility | Hours follow the venue model, but the city's worker count can sit below rota demand, so a venue can miss one of its published roles at some hours. `shiftMix` is accepted with no effect. Agree filled capacity and shortages. | Simulation, Atlas, Interior, Engine, Quests |
| Movement handoff | Routing can pick the nearest network node. Local intent picks the first matching role and has no floor path. | Atlas, Connections, Interior, Simulation, Engine, Quests |
| Interruptions | Interrupt freezes a logical minute; resume reads the current schedule. Agree owners, nesting, delayed arrival and physical saves. | Simulation, Engine, Quests |
| Transit staff and service | Service windows collapse to an outer span and first headway. Agree driver-to-vehicle duty and direction. | Connections, Simulation, Engine |
| Version compatibility | Save version 1 is seed and events. Agree fingerprints, supported versions and migrations. | Atlas, Connections, Interior, Naming, Simulation, Engine, Quests |
| Measured performance | Prefix counts, cold statistics, job-slot init and candidate enumeration grow with capacity. Agree query/frame budgets. | Simulation, Engine |
| Outdoor path ownership | Agree Atlas versus Connections as path owner before changing the network input. | Atlas, Connections, Simulation, Engine |
| Transit modes | Agree subway-only versus optional bus/train before dropping public fields or jobs. | Atlas, Connections, Simulation, Engine, Quests |
| Persistent effects | Promote assigns an executive schedule with no destination slot or home move. Family stubs do not refresh when relatives are reserved. | Simulation, Interior, Naming, Quests, Engine |
| Input admission | Validation skips some weights, headway, handle syntax and interruption time. Strengthening refusals changes callers. | Simulation, Atlas, Connections, Interior, Naming, Engine, Quests |
| Population accounting | Public `unemployed` is all nonworking adults. Aggregates stay at initial allocation. | Simulation, Naming, Engine, Quests |

The isolated testbed checks logical queries. Physical travel, per-floor actions and actor saves need prepared producer data and Engine acceptance.
