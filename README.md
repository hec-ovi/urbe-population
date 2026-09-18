# @urbe/simulation 0.9.2

An embeddable TypeScript API for statistical crowds and persistent NPC identities during gameplay. The host supplies prepared city data, game time and ordered interactions. Simulation performs no I/O, wall-clock updates or LLM calls.

## Run

```sh
npm ci
npm run build
npm test
npm run typecheck
npm run testbed
```

The standalone 2D testbed serves `/testbed/` on localhost:8080, trying the next free port when occupied. `PORT` selects the starting port. Generated `dist/` and `testbed/` stay out of git.

## Use

[SKILL.md](SKILL.md) contains the copyable library example and defaults. [CONTRACT.md](CONTRACT.md) lists every call, schema and error. [docs/INDEX.md](docs/INDEX.md) maps the library and testbed.

Creation prepares Atlas places, Connections paths, Interior roles and Naming catalogs. Engine creates or restores Simulation when the game loads; Quests resolves its cast through that same API. The package has no runtime dependencies.

Counts are computed from the prepared population; interaction establishes a named person and records replay events. Exact walking continuity needs network `path3`. The 2D fixture is a logical preview, with no physical journey or frame-rate guarantee. [docs/ISSUES.md](docs/ISSUES.md) lists open occupancy, capacity, movement and save questions.
