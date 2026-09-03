// @vitest-environment happy-dom

import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CityFeed, NpcSummary } from './adapter/types.js';

const NPC: NpcSummary = {
  npcId: 'npc-ada',
  name: { given: 'Ada', family: 'Vale' },
  gender: 'female',
  type: 'barista',
  home: { parcelId: 'p-home', unit: 2 },
  job: {
    parcelId: 'p-cafe',
    role: 'counter',
    shift: { kind: 'day', startMin: 480, endMin: 960, days: [0, 1, 2, 3, 4] },
  },
  family: [],
  commutes: [],
};

describe('simulation testbed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    document.body.replaceChildren();
  });

  it('renders the feed, advances time, and instantiates a clicked crowd agent', async () => {
    const feed = testFeed();
    mountPage();
    const { startTestbed } = await import('./bootstrap.js');
    const user = userEvent.setup();

    expect(startTestbed(feed)).not.toBeNull();

    expect(screen.getByText('NO NPC SELECTED')).toBeTruthy();
    expect(feed.dots).toHaveBeenLastCalledWith(540);

    await user.click(screen.getByRole('button', { name: '+1h' }));
    expect(feed.dots).toHaveBeenLastCalledWith(600);
    expect(screen.getByText('10:00:00')).toBeTruthy();

    await clickCenter(user);
    expect(feed.instantiateDot).toHaveBeenCalledWith('agent-a', 600);
    expect(screen.getByText('Ada Vale')).toBeTruthy();
    expect(screen.getByText('NPC INSTANCED')).toBeTruthy();
    expect(screen.getByText('WORK')).toBeTruthy();
  });

  it('contains a crowd-query failure in the inspector and toast', async () => {
    const feed = testFeed();
    vi.mocked(feed.instantiateDot).mockImplementation(() => {
      throw new Error('E_STALE_HANDLE: crowd trip ended');
    });
    mountPage();
    const { startTestbed } = await import('./bootstrap.js');
    const user = userEvent.setup();

    expect(startTestbed(feed)).not.toBeNull();
    await clickCenter(user);

    expect(screen.getByText('[SIMULATION EXCEPTION]')).toBeTruthy();
    expect(screen.getAllByText('E_STALE_HANDLE: crowd trip ended')).toHaveLength(2);
    expect(screen.getByText('QUERY FAILED')).toBeTruthy();
  });

  it('resolves a clicked staffed parcel through the vendor entry', async () => {
    const feed = testFeed();
    vi.mocked(feed.dots).mockReturnValue([]);
    mountPage();
    const { startTestbed } = await import('./bootstrap.js');
    const user = userEvent.setup();

    expect(startTestbed(feed)).not.toBeNull();
    await clickCenter(user);

    expect(feed.vendorAt).toHaveBeenCalledWith('p-cafe', 540);
    expect(screen.getByText('Ada Vale')).toBeTruthy();
    expect(screen.getByText('VENDOR FOUND')).toBeTruthy();
  });

  it('contains missing page mounts as E_MOUNT_UNAVAILABLE', async () => {
    const feed = testFeed();
    mountPage();
    document.getElementById('legend')?.remove();
    const { startTestbed } = await import('./bootstrap.js');

    expect(startTestbed(feed)).toBeNull();
    expect(screen.getByText('[E_MOUNT_UNAVAILABLE]')).toBeTruthy();
    expect(screen.getByText('missing #legend in index.html')).toBeTruthy();
  });

  it('contains missing canvas support as E_CANVAS_UNAVAILABLE', async () => {
    const feed = testFeed();
    mountPage();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const { startTestbed } = await import('./bootstrap.js');

    expect(startTestbed(feed)).toBeNull();
    expect(screen.getByText('[E_CANVAS_UNAVAILABLE]')).toBeTruthy();
    expect(screen.getByText('2D canvas context unavailable')).toBeTruthy();
  });

  it('contains an unexpected boot failure as E_STARTUP', async () => {
    const feed = testFeed();
    vi.mocked(feed.scene).mockImplementation(() => {
      throw new Error('fixture unavailable');
    });
    mountPage();
    const { startTestbed } = await import('./bootstrap.js');

    expect(startTestbed(feed)).toBeNull();
    expect(screen.getByText('[E_STARTUP]')).toBeTruthy();
    expect(screen.getByText('fixture unavailable')).toBeTruthy();
  });
});

function testFeed(): CityFeed {
  return {
    timeRange: { min: 0, max: 10_079 },
    scene: vi.fn(() => ({
      bounds: { minX: -50, minY: -25, maxX: 50, maxY: 25 },
      districts: [],
      streets: [],
      parcels: [{
        id: 'p-cafe',
        type: 'coffee_shop',
        footprint: [[-10, -8], [10, -8], [10, 8], [-10, 8]],
        bounds: { minX: -10, minY: -8, maxX: 10, maxY: 8 },
        staffed: true,
      }],
      stops: [],
      parcelTypes: ['coffee_shop'],
    })),
    dots: vi.fn(() => [{ id: 'agent-a', position: [0, 0], activity: 'walk' }]),
    instantiateDot: vi.fn(() => NPC),
    vendorAt: vi.fn(() => NPC),
    behavior: vi.fn(() => ({
      activity: 'work',
      mode: 'scheduled',
      place: { kind: 'parcel', id: 'p-cafe' },
      interrupted: false,
    })),
  };
}

function mountPage(): void {
  document.body.innerHTML = `
    <div id="controls"></div>
    <canvas id="map" width="1000" height="500"></canvas>
    <div id="legend"></div>
    <aside id="inspector"></aside>
    <div id="toast-container"></div>
  `;

  const context = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 500,
    right: 1000,
    bottom: 500,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

async function clickCenter(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const canvas = document.getElementById('map');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('test fixture: missing canvas');
  await user.pointer({
    keys: '[MouseLeft]',
    target: canvas,
    coords: { clientX: 500, clientY: 250 },
  });
}
