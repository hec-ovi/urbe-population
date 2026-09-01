/** Wires the feed to the map, the inspector and the time control. */

import { mountPoint } from './components/dom.js';
import { CityMapView } from './views/city-map.js';
import { InspectorView } from './views/inspector.js';
import { Legend } from './widgets/legend.js';
import { TimeControls } from './widgets/time-controls.js';
import { CANVAS_THEME, PARCEL_COLORS, colorOf } from './theme.js';
import type { CityFeed, NpcSummary } from './adapter/types.js';

/** Monday 09:00: shops open, commuters on the street. */
const START_MIN = 9 * 60;
const PLAYBACK = { stepMin: 2, tickMs: 100 };

export class TestbedApp {
  private readonly map: CityMapView;
  private readonly inspector: InspectorView;
  private readonly controls: TimeControls;
  private selectedNpcId: string | undefined;

  constructor(private readonly feed: CityFeed) {
    const scene = feed.scene();
    this.map = new CityMapView(mountPoint<HTMLCanvasElement>('map'), scene, {
      onDot: (dotId) => this.pick(() => feed.instantiateDot(dotId, this.controls.value)),
      onPlace: (parcelId) => this.pick(() => feed.vendorAt(parcelId, this.controls.value)),
    });
    this.inspector = new InspectorView(mountPoint('inspector'));
    new Legend(mountPoint('legend')).show(
      scene.parcelTypes.map((type) => ({ label: type, color: colorOf(PARCEL_COLORS, type, CANVAS_THEME.parcelFallback) })),
    );
    this.controls = new TimeControls(mountPoint('controls'), {
      min: feed.timeRange.min,
      max: feed.timeRange.max,
      value: START_MIN,
      stepMin: PLAYBACK.stepMin,
      tickMs: PLAYBACK.tickMs,
      onChange: (timeMin) => this.refresh(timeMin),
    });
  }

  start(): void {
    this.refresh(this.controls.value);
  }

  private refresh(timeMin: number): void {
    this.map.render(this.feed.dots(timeMin));
    if (this.selectedNpcId) this.inspector.showBehavior(this.feed.behavior(this.selectedNpcId, timeMin));
  }

  private pick(resolve: () => NpcSummary): void {
    try {
      const npc = resolve();
      this.selectedNpcId = npc.npcId;
      this.inspector.showNpc(npc);
    } catch (err) {
      this.selectedNpcId = undefined;
      this.inspector.showError(err instanceof Error ? err.message : String(err));
    }
    this.refresh(this.controls.value);
  }
}
