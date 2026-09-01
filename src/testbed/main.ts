/** 2D plane testbed: fixture city, crowd dots over time, click to instantiate. */

import { createSimulation } from '../api/simulation.js';
import { FIXTURE_BLUEPRINT, FIXTURE_INTERIORS } from '../fixtures/small-city.js';
import type { CrowdAgent } from '../schemas/crowd.js';
import type { Vec2 } from '../schemas/blueprint.js';

const sim = createSimulation({ seed: 'testbed', blueprint: FIXTURE_BLUEPRINT, interiors: FIXTURE_INTERIORS });

const TYPE_COLORS: Record<string, string> = {
  residential: '#3a6ea5', hotel: '#7a5c99', offices: '#2e8b8b', corpo: '#1f6f8b', hospital: '#c94f4f',
  clinic: '#c97f4f', police: '#2f4a8a', military: '#4a5d23', factory: '#8a6d3b', commerce: '#d98e32',
  mall: '#d9b432', restaurant: '#c9473f', coffee_shop: '#8a5a3b',
};

const canvas = document.getElementById('map') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const timeInput = document.getElementById('time') as HTMLInputElement;
const clock = document.getElementById('clock')!;
const playBtn = document.getElementById('play')!;
const npcPre = document.getElementById('npc')!;
const nowPre = document.getElementById('now')!;
const legend = document.getElementById('legend')!;

legend.innerHTML = Object.entries(TYPE_COLORS)
  .map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`)
  .join('');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let playing = false;
let selectedNpc: string | undefined;
let dots: { agent: CrowdAgent; x: number; y: number }[] = [];

function alongPath(path: Vec2[], t: number): Vec2 {
  if (path.length < 2) return path[0] ?? [0, 0];
  const [a, b] = [path[0]!, path[path.length - 1]!];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function draw(): void {
  const t = Number(timeInput.value);
  clock.textContent = `${DAYS[Math.floor(t / 1440) % 7]} ${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const d of FIXTURE_BLUEPRINT.districts) {
    ctx.fillStyle = d.kind === 'downtown' ? '#181d24' : '#171a17';
    const b = d.boundary;
    ctx.beginPath();
    ctx.moveTo(b[0]![0], b[0]![1]);
    for (const p of b.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#3a3f46';
  ctx.lineWidth = 4;
  for (const e of FIXTURE_BLUEPRINT.streets.edges) {
    ctx.beginPath();
    ctx.moveTo(e.path[0]![0], e.path[0]![1]);
    for (const p of e.path.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  }
  for (const p of FIXTURE_BLUEPRINT.parcels) {
    ctx.fillStyle = TYPE_COLORS[p.type] ?? '#666';
    const f = p.footprint;
    ctx.beginPath();
    ctx.moveTo(f[0]![0], f[0]![1]);
    for (const q of f.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#e0c341';
  for (const s of FIXTURE_BLUEPRINT.transit.busStops) ctx.fillRect(s.position[0] - 3, s.position[1] - 3, 6, 6);

  dots = [];
  for (const e of FIXTURE_BLUEPRINT.streets.edges) {
    const slice = sim.crowd(t, { kind: 'edge', id: e.id });
    for (const agent of slice.agents) {
      const [x, y] = alongPath(e.path, agent.progress);
      const jitter = (agent.crowdId.length * 7) % 9 - 4;
      dots.push({ agent, x, y: y + jitter });
      ctx.fillStyle = agent.activity === 'commuting' ? '#7fd1b9' : '#d1a97f';
      ctx.fillRect(x - 2, y + jitter - 2, 4, 4);
    }
  }

  if (selectedNpc) {
    try {
      const b = sim.behaviorAt(selectedNpc, t);
      nowPre.textContent = `${b.activity} (${b.mode}) at ${b.place.kind} ${b.place.id}` +
        (b.interior && 'at' in b.interior ? `\nanchor ${b.interior.at.anchorId} · ${b.interior.at.animation}` : '') +
        (b.interior && 'walk' in b.interior ? `\nwalking ${b.interior.walk.fromAnchorId} -> ${b.interior.walk.toAnchorId}` : '') +
        (b.interrupted ? '\n[interrupted]' : '');
    } catch {
      nowPre.textContent = '(dead or unknown)';
    }
  }
}

function showNpc(npc: ReturnType<typeof sim.getNPC>): void {
  selectedNpc = npc.npcId;
  const job = npc.job
    ? `${npc.job.role} @ ${npc.job.parcelId} (${npc.job.shift.kind} ${fmt(npc.job.shift.startMin)}-${fmt(npc.job.shift.endMin)}, days ${npc.job.shift.days.join('')})`
    : 'unemployed';
  const family = npc.family.map((f) => `  ${f.relation}: ${f.name.given} ${f.name.family}${f.instantiated ? ' *' : ''}`).join('\n');
  const legs = npc.routine.filter((e) => e.transitLeg).map((e) => `  ${DAYS[e.days[0]!]} ${fmt(e.startMin)} bus ${e.transitLeg!.routeId} ${e.transitLeg!.boardStopId}->${e.transitLeg!.alightStopId}`);
  npcPre.textContent = [
    `${npc.name.given} ${npc.name.family} (${npc.npcId})`,
    `type: ${npc.type}`,
    `home: ${npc.home.parcelId} unit ${npc.home.unit}`,
    `job: ${job}`,
    npc.family.length ? `family:\n${family}` : 'family: none',
    legs.length ? `commutes:\n${[...new Set(legs)].slice(0, 3).join('\n')}` : 'commutes: walks',
  ].join('\n');
}

function fmt(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((ev.clientY - rect.top) / rect.height) * canvas.height;
  const t = Number(timeInput.value);
  for (const d of dots) {
    if (Math.abs(d.x - x) < 6 && Math.abs(d.y - y) < 6) {
      try {
        showNpc(sim.instantiate({ crowdId: d.agent.crowdId, timeMin: t }));
      } catch (e) {
        npcPre.textContent = String(e);
      }
      draw();
      return;
    }
  }
  for (const p of FIXTURE_BLUEPRINT.parcels) {
    const f = p.footprint;
    if (x >= f[0]![0] && x <= f[1]![0] && y >= f[0]![1] && y <= f[2]![1] && p.type !== 'residential') {
      try {
        showNpc(sim.getNPCVendor({ parcelId: p.id, timeMin: t }));
      } catch (e) {
        npcPre.textContent = String(e);
      }
      draw();
      return;
    }
  }
});

timeInput.addEventListener('input', draw);
playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? 'pause' : 'play';
});
setInterval(() => {
  if (playing) {
    timeInput.value = String((Number(timeInput.value) + 2) % 10080);
    draw();
  }
}, 100);

draw();
