/** Wires the feed to the map, the inspector, the time control, and the toast system. */

import { mountPoint } from './components/dom.js';
import { toast } from './components/toast.js';
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
      onDot: (dotId) => {
        this.map.setSelection({ kind: 'dot', id: dotId });
        this.pick(
          () => feed.instantiateDot(dotId, this.controls.value),
          (npc) => toast.success(`Instantiated NPC: ${npc.name.given} ${npc.name.family} (#${npc.npcId})`, 'NPC INSTANCED'),
        );
      },
      onPlace: (parcelId) => {
        this.map.setSelection({ kind: 'parcel', id: parcelId });
        this.pick(
          () => feed.vendorAt(parcelId, this.controls.value),
          (npc) => toast.info(`Staff at ${parcelId}: ${npc.name.given} ${npc.name.family} (${npc.job?.role ?? 'staff'})`, 'VENDOR FOUND'),
        );
      },
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

    // Global keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.controls.toggle();
      }
    });
  }

  start(): void {
    this.refresh(this.controls.value);
    toast.info('Testbed simulation active · Mon 09:00', 'INITIALIZED');
  }

  private refresh(timeMin: number): void {
    this.map.render(this.feed.dots(timeMin));
    if (this.selectedNpcId) {
      this.inspector.showBehavior(this.feed.behavior(this.selectedNpcId, timeMin));
    }
  }

  private pick(resolve: () => NpcSummary, onSuccess?: (npc: NpcSummary) => void): void {
    try {
      const npc = resolve();
      this.selectedNpcId = npc.npcId;
      this.inspector.showNpc(npc);
      if (onSuccess) onSuccess(npc);
    } catch (err) {
      this.selectedNpcId = undefined;
      const msg = err instanceof Error ? err.message : String(err);
      this.inspector.showError(msg);
      toast.warn(msg, 'QUERY FAILED');
    }
    this.refresh(this.controls.value);
  }
}
