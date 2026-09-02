/**
 * Weekly routine builder: a full-coverage timeline (sleep, home, commute legs
 * with the specific bus or subway, work shift, free time) as contract
 * RoutineEntry lists. Activity-based schema: ordered (activity, place, time)
 * segments, deterministic per NPC.
 */

import { rand } from '../core/rng.js';
import { dist2 } from '../world/geo.js';
import { MIN_PER_DAY, MIN_PER_WEEK } from '../core/time.js';
import type { WorldModel, ServiceRoute } from '../world/model.js';
import type { JobAssignment } from '../population/assignment.js';
import type { NPCCategory } from '../schemas/npc-types.js';
import type { RoutineEntry, TransitLeg } from '../schemas/npc.js';
import type { Vec2 } from '../schemas/blueprint.js';
import type { Activity, PlaceRef } from '../schemas/crowd.js';

/** One end of a commute: where the person stands, and the place that names it. */
interface CommuteEnd {
  point: Vec2;
  place: PlaceRef;
}

interface Segment {
  startW: number;
  activity: Activity;
  place: PlaceRef;
  transitLeg?: TransitLeg;
}

const WALK_M_PER_MIN = 80;
const VENUE_TYPES = new Set(['commerce', 'mall', 'restaurant', 'coffee_shop']);

export class RoutineBuilder {
  constructor(
    private readonly seed: string | number,
    private readonly world: WorldModel,
  ) {}

  build(npcId: string, category: NPCCategory, homeParcelId: string, job: JobAssignment | undefined): RoutineEntry[] {
    const segments: Segment[] = [];
    const homePlace: PlaceRef = { kind: 'parcel', id: homeParcelId };
    const workDays = new Set(job?.shift.days ?? []);

    for (let d = 0; d < 7; d++) {
      if (job && workDays.has(d)) this.workDay(segments, npcId, d, homeParcelId, homePlace, job);
      else this.freeDay(segments, npcId, d, homeParcelId, homePlace, category);
    }
    segments.sort((a, b) => a.startW - b.startW);
    const deduped: Segment[] = [];
    for (const s of segments) {
      const prev = deduped[deduped.length - 1];
      if (prev && s.startW <= prev.startW) continue;
      deduped.push(s);
    }
    return toEntries(deduped);
  }

  private workDay(out: Segment[], npcId: string, d: number, homeParcelId: string, homePlace: PlaceRef, job: JobAssignment): void {
    const r = rand(this.seed, 'workday', npcId, d);
    const shiftLen = (job.shift.endMin - job.shift.startMin + MIN_PER_DAY) % MIN_PER_DAY || 8 * 60;
    const startW = d * MIN_PER_DAY + job.shift.startMin;
    const endW = startW + shiftLen;
    const workPlace: PlaceRef = job.workplace.place;
    const home = this.endOfParcel(homeParcelId);
    const work = this.endOfWorkplace(job.workplace);

    const legs = this.commuteLegs(home, work, job.shift.startMin);
    let cursor = startW;
    for (let i = legs.length - 1; i >= 0; i--) {
      cursor -= legs[i]!.minutes;
    }
    const leaveHome = cursor;
    out.push({ startW: wrapW(leaveHome - 45), activity: 'home', place: homePlace });
    for (const leg of legs) {
      out.push({ startW: wrapW(cursor), activity: leg.activity, place: leg.place, ...(leg.transitLeg ? { transitLeg: leg.transitLeg } : {}) });
      cursor += leg.minutes;
    }
    out.push({ startW: wrapW(startW), activity: 'working', place: workPlace });

    const back = this.commuteLegs(work, home, (job.shift.endMin + 5) % MIN_PER_DAY);
    let backCursor = endW;
    for (const leg of back) {
      out.push({ startW: wrapW(backCursor), activity: leg.activity, place: leg.place, ...(leg.transitLeg ? { transitLeg: leg.transitLeg } : {}) });
      backCursor += leg.minutes;
    }
    const homeAgain = backCursor;

    if (job.shift.kind === 'night') {
      out.push({ startW: wrapW(homeAgain), activity: 'sleeping', place: homePlace });
      out.push({ startW: wrapW(homeAgain + 8 * 60), activity: 'home', place: homePlace });
    } else {
      out.push({ startW: wrapW(homeAgain), activity: 'home', place: homePlace });
      const eveningMin = homeAgain % MIN_PER_DAY;
      if (eveningMin < 20 * 60 && r.next() < 0.4) {
        const venue = this.pickVenue(npcId, d, homeParcelId);
        if (venue) {
          const outAt = homeAgain + 45 + r.int(46);
          out.push({ startW: wrapW(outAt), activity: 'leisure', place: { kind: 'parcel', id: venue } });
          out.push({ startW: wrapW(outAt + 60 + r.int(61)), activity: 'home', place: homePlace });
        }
      }
      out.push({ startW: wrapW(d * MIN_PER_DAY + 22 * 60 + 30 + r.int(61)), activity: 'sleeping', place: homePlace });
    }
  }

  private freeDay(out: Segment[], npcId: string, d: number, homeParcelId: string, homePlace: PlaceRef, category: NPCCategory): void {
    const r = rand(this.seed, 'freeday', npcId, d);
    const base = d * MIN_PER_DAY;
    if (category === 'street') {
      const edge = this.pickEdge(npcId, d, homeParcelId);
      out.push({ startW: base + 30, activity: 'sleeping', place: homePlace });
      out.push({ startW: base + 7 * 60 + r.int(90), activity: 'leisure', place: edge });
      out.push({ startW: base + 13 * 60 + r.int(60), activity: 'leisure', place: this.pickEdge(npcId, d + 10, homeParcelId) });
      out.push({ startW: base + 22 * 60 + r.int(60), activity: 'home', place: homePlace });
      return;
    }
    out.push({ startW: base + 7 * 60 + 45 + r.int(76), activity: 'home', place: homePlace });
    const venue = this.pickVenue(npcId, d, homeParcelId);
    if (venue) {
      out.push({ startW: base + 10 * 60 + r.int(90), activity: 'shopping', place: { kind: 'parcel', id: venue } });
      out.push({ startW: base + 12 * 60 + 30 + r.int(60), activity: 'home', place: homePlace });
    }
    if (r.next() < 0.6) {
      out.push({ startW: base + 15 * 60 + r.int(90), activity: 'leisure', place: this.pickEdge(npcId, d, homeParcelId) });
      out.push({ startW: base + 18 * 60 + r.int(45), activity: 'home', place: homePlace });
    }
    out.push({ startW: base + 22 * 60 + 45 + r.int(61), activity: 'sleeping', place: homePlace });
  }

  /** Where a home parcel puts a commuter: on its access point, walking its street. */
  private endOfParcel(parcelId: string): CommuteEnd {
    const p = this.world.parcelsById.get(parcelId)!;
    return { point: p.access.point, place: { kind: 'edge', id: p.access.edgeId } };
  }

  /** Where a job puts a commuter: a building's door, a station itself, or a route's first terminus. */
  private endOfWorkplace(workplace: JobAssignment['workplace']): CommuteEnd {
    if (workplace.place.kind === 'parcel') return this.endOfParcel(workplace.place.id);
    if (workplace.place.kind === 'stop') {
      return { point: this.world.stopsById.get(workplace.place.id)!.position, place: workplace.place };
    }
    const route = this.world.routes.find((r) => r.id === workplace.place.id)!;
    const terminus = this.world.stopsById.get(route.stopIds[0]!)!;
    return { point: terminus.position, place: { kind: 'stop', id: terminus.id } };
  }

  /** Ordered commute legs with durations; transit when a direct in-service route exists. */
  private commuteLegs(
    from: CommuteEnd,
    to: CommuteEnd,
    departMin: number,
  ): { minutes: number; activity: Activity; place: PlaceRef; transitLeg?: TransitLeg }[] {
    const boardStop = this.world.nearestStopId(from.point);
    const alightStop = this.world.nearestStopId(to.point);

    if (boardStop && alightStop && boardStop !== alightStop) {
      const route = this.world.directRoute(boardStop, alightStop) ?? this.world.directRoute(alightStop, boardStop);
      if (route && this.inService(route, departMin)) {
        const wa = walkMinutes(from.point, this.world.stopsById.get(boardStop)!.position, 1, 30);
        const wb = walkMinutes(this.world.stopsById.get(alightStop)!.position, to.point, 1, 30);
        const ride = Math.max(1, this.rideBetween(route, boardStop, alightStop));
        return [
          { minutes: wa, activity: 'commuting', place: from.place },
          { minutes: Math.max(1, Math.round(route.headwayMin / 2)), activity: 'transit_wait', place: { kind: 'stop', id: boardStop } },
          { minutes: ride, activity: 'commuting', place: { kind: 'route', id: route.id }, transitLeg: { routeId: route.id, boardStopId: boardStop, alightStopId: alightStop } },
          { minutes: wb, activity: 'commuting', place: to.place },
        ];
      }
    }
    return [{ minutes: walkMinutes(from.point, to.point, 5, 120), activity: 'commuting', place: from.place }];
  }

  private inService(route: ServiceRoute, minuteOfDay: number): boolean {
    if (route.serviceStartMin <= route.serviceEndMin)
      return minuteOfDay >= route.serviceStartMin && minuteOfDay <= route.serviceEndMin;
    return minuteOfDay >= route.serviceStartMin || minuteOfDay <= route.serviceEndMin;
  }

  private rideBetween(route: ServiceRoute, a: string, b: string): number {
    const ia = route.stopIds.indexOf(a);
    const ib = route.stopIds.indexOf(b);
    const [lo, hi] = ia < ib ? [ia, ib] : [ib, ia];
    let sum = 0;
    for (let i = lo; i < hi; i++) sum += route.legMinutes[i] ?? 1;
    return sum;
  }

  private pickVenue(npcId: string, salt: number, homeParcelId: string): string | undefined {
    const home = this.world.parcelsById.get(homeParcelId)!;
    const venues = this.world.workplaces.filter((w) => w.parcelType !== undefined && VENUE_TYPES.has(w.parcelType));
    let candidates = venues.filter((w) => w.districtId === home.districtId);
    if (candidates.length === 0) candidates = venues;
    if (candidates.length === 0) return undefined;
    return rand(this.seed, 'venue', npcId, salt).pick(candidates).place.id;
  }

  private pickEdge(npcId: string, salt: number, homeParcelId: string): PlaceRef {
    const home = this.world.parcelsById.get(homeParcelId)!;
    let candidates = this.world.crowdEdges.filter((e) => e.districtId === home.districtId);
    if (candidates.length === 0) candidates = this.world.crowdEdges;
    if (candidates.length === 0) return { kind: 'parcel', id: homeParcelId };
    return { kind: 'edge', id: rand(this.seed, 'edge', npcId, salt).pick(candidates).id };
  }
}

function wrapW(w: number): number {
  return ((w % MIN_PER_WEEK) + MIN_PER_WEEK) % MIN_PER_WEEK;
}

function walkMinutes(a: Vec2, b: Vec2, min: number, max: number): number {
  const m = Math.ceil(Math.sqrt(dist2(a, b)) / WALK_M_PER_MIN);
  return Math.min(max, Math.max(min, m));
}

/** Weekly segments (implicit ends) to per-day contract entries, full coverage. */
function toEntries(segments: Segment[]): RoutineEntry[] {
  if (segments.length === 0) return [];
  const entries: RoutineEntry[] = [];
  const emit = (startW: number, endW: number, seg: Segment): void => {
    let s = startW;
    while (s < endW) {
      const day = Math.floor(s / MIN_PER_DAY);
      const dayEnd = (day + 1) * MIN_PER_DAY;
      const e = Math.min(endW, dayEnd);
      entries.push({
        days: [day % 7],
        startMin: s - day * MIN_PER_DAY,
        endMin: e - day * MIN_PER_DAY === 0 ? MIN_PER_DAY : e - day * MIN_PER_DAY,
        activity: seg.activity,
        place: seg.place,
        ...(seg.transitLeg ? { transitLeg: seg.transitLeg } : {}),
      });
      s = e;
    }
  };
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const next = segments[i + 1];
    emit(seg.startW, next ? next.startW : MIN_PER_WEEK, seg);
  }
  const first = segments[0]!;
  const last = segments[segments.length - 1]!;
  if (first.startW > 0) emit(0, first.startW, last);
  return entries;
}
