# CONTRACT: simulation testbed

Purpose: renders the fixture city, its crowd and one selected NPC at any minute of the week without owning simulation rules.

The testbed is not part of the library package. Nothing in `dist/` imports this folder.

## In

`startTestbed(feed?: CityFeed): TestbedApp | null` in [bootstrap.ts](bootstrap.ts) is the browser entry. An omitted feed uses `createCityFeed("testbed")` from [adapter/city-feed.ts](adapter/city-feed.ts), which adapts the bundled fixture through the root library.

`CityFeed` in [adapter/types.ts](adapter/types.ts):

- `timeRange: { min, max }`: inclusive minute bounds.
- `scene()`: world bounds, districts, streets, staffed parcels, stops and parcel types.
- `dots(timeMin)`: crowd dots with id, position and activity.
- `instantiateDot(dotId, timeMin)` and `vendorAt(parcelId, timeMin)`: `NpcSummary` or a code-prefixed `Error`.
- `behavior(npcId, timeMin)`: `BehaviorSummary`, or `null` when the person cannot be tracked.

The page provides `#controls`, `#map`, `#legend`, `#inspector` and `#toast-container` mount points.

## Components and events

- `TestbedApp(feed)`: wires the page. `start()` renders Monday 09:00.
- `TimeControls(root, options)`: play, pause, step, speed, day and range controls. It emits `onChange(timeMin)` inside `timeRange`.
- `CityMapView(canvas, scene, handlers)`: renders the static scene and current dots. A dot click emits `onDot(dotId)`; a staffed parcel click emits `onPlace(parcelId)`.
- `InspectorView(root)`: renders an NPC, live behavior, or a contained query error.
- `Legend(root).show(items)`: renders one color entry per parcel type.
- `ToastManager`: renders startup, query and copy feedback. Close buttons dismiss their own toast.
- Pressing Space outside an input toggles playback.

## Out

A square-cornered 2D page. Time changes redraw the crowd and the selected NPC's behavior. Selecting a crowd dot instantiates its person; selecting a staffed parcel resolves the worker on duty. Query failures appear in the inspector and a toast.

## Errors

Closed startup display codes:

- `E_MOUNT_UNAVAILABLE`: a required page mount is missing.
- `E_CANVAS_UNAVAILABLE`: the browser supplies no 2D canvas context.
- `E_STARTUP`: another startup failure.

The browser entry catches all three and renders the code and message. Instantiation and vendor queries may display only `E_UNKNOWN_ID`, `E_STALE_HANDLE`, `E_NO_MATCH`, or `E_TIME` from the root contract; event handlers catch them. Behavior lookup failures render as an untracked state through `null`.

## Invariants

- [adapter/city-feed.ts](adapter/city-feed.ts) is the only UI file that imports the simulation library.
- Views, widgets and components consume only [adapter/types.ts](adapter/types.ts).
- The UI computes no population, routine, route or crowd position.
- Every control keeps time inside the feed's inclusive range.
- All controls, panels, badges and notifications have square corners.
- [app.test.ts](app.test.ts) exercises controls, canvas selection and every contained error class through rendered DOM with Testing Library and user-event.

## Depends on

- [../../CONTRACT.md](../../CONTRACT.md), through [adapter/city-feed.ts](adapter/city-feed.ts) only.

## Run

`npm run testbed` builds `testbed/` and serves `/testbed/`. `PORT` selects the starting port; the server advances when it is busy.
