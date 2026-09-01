# CONTRACT: ui (testbed frontend)

Purpose: the 2D preview of the fixture city. Draws the map and the crowd at any minute of the week, and shows the NPC behind whatever you click.

Not part of the library surface: nothing in dist/ imports this folder, and this folder holds no simulation logic.

## Structure
- `index.html`: page skeleton. Four mount points: `#controls`, `#map` (canvas), `#legend`, `#inspector`.
- `styles.css`: everything outside the canvas.
- `theme.ts`: canvas palette and pixel sizes (the canvas half of styling).
- `main.ts` / `app.ts`: entry point and wiring.
- `views/`: `city-map.ts` (draws the scene and routes clicks), `inspector.ts` (side panel).
- `widgets/`: `time-controls.ts`, `legend.ts`, `npc-card.ts`, `behavior-card.ts`.
- `components/`: `canvas-surface.ts`, `text-panel.ts`, `dom.ts`, `time-format.ts`. Shared primitives with no city knowledge.
- `adapter/`: `types.ts` (the plain shapes above) and `city-feed.ts`.

## In
`createCityFeed(seed?)` from `adapter/city-feed.ts` returns a `CityFeed`, the only simulation the UI sees:

- `timeRange`: minute range of one week.
- `scene()`: districts, streets, parcels (with bounds and a `staffed` flag), transit stops, parcel types, world bounds.
- `dots(timeMin)`: crowd pseudo-agents as `{ id, position, activity }`.
- `instantiateDot(dotId, timeMin)` / `vendorAt(parcelId, timeMin)`: `NpcSummary`. Throw a plain `Error` whose message is `CODE: text`.
- `behavior(npcId, timeMin)`: `BehaviorSummary`, or null when the NPC is dead or unknown.

## Out
A rendered page. Clicking a dot instantiates that NPC; clicking a staffed place asks for the worker on duty; the inspector then follows the selection as time moves.

## Invariants
- `adapter/city-feed.ts` is the only file here that imports the library. Views, widgets and components import nothing outside `src/ui`.
- Restyling means editing `styles.css`, `theme.ts` and the markup in `index.html`; no other file has to change.
- The UI never computes population, routines or positions of its own: it renders what the feed returns.

## Depends on
- `../index.ts` (the library entry), through `adapter/city-feed.ts` only.

## Run
`npm run testbed` from the box root: builds into `testbed/` and serves http://localhost:8080/testbed/, moving to the next free port when 8080 is busy (`PORT` picks another). The command prints the URL it settled on.
