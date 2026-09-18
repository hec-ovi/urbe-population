# Simulation testbed 0.9.3

Displays a prepared fixture, explicit game time and a selected NPC through the Simulation API.

## Input and output

[main.ts](main.ts) mounts `#app`, renders [views/testbed.json](views/testbed.json), then calls `startTestbed(feed?)` in [bootstrap.ts](bootstrap.ts). Omitted feed uses the real fixture adapter. The library package excludes the testbed.

[CityFeed](adapter/types.ts) supplies time bounds, static scene, crowd positions, NPC summaries and behavior. The adapter is the only UI module importing the library; it queries walking edges only. The host handles clock updates, selection, clipboard actions and simulation calls. Components render supplied data and emit actions.

| Component | Input | Events/output |
| --- | --- | --- |
| `TimeControls` | Root, bounded preview-clock options | Play/pause, step, day, speed and range changes; `onChange(timeMin)` |
| `CityMapView` | Canvas, scene, handlers | Crowd drawing; `onDot(id)`, `onPlace(id)` |
| `InspectorView` | Root, copy actions; NPC/behavior/error data | JSON-defined identity, employment, family, commute and state panels |
| `Legend` | Root; labels/colors | Parcel color key |
| Toasts | Message, title | Feedback and close action |

[ElementSpec](ui/schema.ts) defines supported JSON nodes: HTML `tag`, `className`, text/attribute bindings, children, `each`, `when` and named click/input `action`s. [ui/element.ts](ui/element.ts) implements each element once. Labels and panel fields live in component JSON. Page mounts after the view renders are `controls`, `map`, `legend`, `inspector`, `toast-container`. Space toggles playback outside text inputs. Elements have square corners.

## Errors

`startTestbed` returns the app or `null` and displays `E_MOUNT_UNAVAILABLE` (missing mount), `E_CANVAS_UNAVAILABLE` (no 2D context), or `E_STARTUP` (other startup failure). Query errors appear in the inspector and toast. The adapter preserves root Simulation error codes in messages; behavior misses return `null`.

## Dependency and verification

[Simulation](../../CONTRACT.md), through [adapter/city-feed.ts](adapter/city-feed.ts). The rendered [contract tests](app.test.ts) exercise the browser entry, controls, selection and error display. `npm run testbed` builds the generated page and serves `/testbed/`; `PORT` defaults to 8080 and advances when occupied. This 2D view does not certify physical travel or rendering performance.
