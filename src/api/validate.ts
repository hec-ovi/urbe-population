/** Input validation: every failure is E_INVALID_INPUT naming the field. */

import { SimulationError } from '../schemas/errors.js';
import { resolvePool } from '../instancing/name-pool.js';
import type { NamePool } from '../schemas/npc-types.js';
import type { SimulationInput } from './simulation.js';
import type { SaveEvent, SimulationSave } from '../instancing/registry.js';

function fail(field: string, why: string): never {
  throw new SimulationError('E_INVALID_INPUT', `${field}: ${why}`, { field });
}

/** Every gender must have given names to draw from, and a family list. */
function checkPool(field: string, pool: NamePool): void {
  const resolved = resolvePool(pool);
  if (resolved.given.male.length === 0 || resolved.given.female.length === 0 || resolved.family.length === 0) {
    fail(field, 'given and family pools must be non-empty');
  }
}

export function validateInput(input: SimulationInput): void {
  if (input.seed === undefined || input.seed === null || input.seed === '') fail('seed', 'required');
  const bp = input.blueprint;
  if (!bp) fail('blueprint', 'required');
  if (!Array.isArray(bp.districts) || bp.districts.length === 0) fail('blueprint.districts', 'at least one district');
  for (const d of bp.districts) {
    if (!Array.isArray(d.boundary) || d.boundary.length < 3) fail(`blueprint.districts.${d.id}.boundary`, 'polygon needs 3+ points');
  }
  if (!Array.isArray(bp.parcels) || bp.parcels.length === 0) fail('blueprint.parcels', 'at least one parcel');
  const districtIds = new Set(bp.districts.map((d) => d.id));
  let residential = 0;
  for (const p of bp.parcels) {
    if (!districtIds.has(p.districtId)) fail(`blueprint.parcels.${p.id}.districtId`, `unknown district ${p.districtId}`);
    if (!Array.isArray(p.footprint) || p.footprint.length < 3) fail(`blueprint.parcels.${p.id}.footprint`, 'polygon needs 3+ points');
    if (p.envelope.minFloors < 1 || p.envelope.maxFloors < p.envelope.minFloors) {
      fail(`blueprint.parcels.${p.id}.envelope`, 'needs 1 <= minFloors <= maxFloors');
    }
    if (p.type === 'residential') residential++;
  }
  if (residential === 0) fail('blueprint.parcels', 'at least one residential parcel');
  if (!bp.stats || !(bp.stats.population >= 0)) fail('blueprint.stats.population', 'must be >= 0');

  if (input.networks) {
    const nodeIds = new Set<string>();
    for (const node of input.networks.walk.nodes) {
      if (nodeIds.has(node.id)) fail(`networks.walk.nodes.${node.id}`, 'duplicate id');
      if (![node.x, node.y, node.z].every(Number.isFinite)) fail(`networks.walk.nodes.${node.id}`, 'coordinates must be finite');
      nodeIds.add(node.id);
    }
    const edgeIds = new Set<string>();
    for (const edge of input.networks.walk.edges) {
      if (edgeIds.has(edge.id)) fail(`networks.walk.edges.${edge.id}`, 'duplicate id');
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) fail(`networks.walk.edges.${edge.id}`, 'references an unknown node');
      if (!Array.isArray(edge.path3) || edge.path3.length < 2 || edge.path3.some((point) => point.length !== 3 || !point.every(Number.isFinite))) {
        fail(`networks.walk.edges.${edge.id}.path3`, 'needs 2+ three-dimensional finite points');
      }
      edgeIds.add(edge.id);
    }
    for (const r of input.networks.transit.routes) {
      if (r.stops.length < 2) fail(`networks.transit.routes.${r.id}.stops`, 'needs 2+ stops');
      if (r.template.length !== r.stops.length) fail(`networks.transit.routes.${r.id}.template`, 'one entry per stop');
      if (r.service.length === 0) fail(`networks.transit.routes.${r.id}.service`, 'needs a service window');
    }
  }

  if (input.npcTypes) {
    if (input.npcTypes.types.length === 0) fail('npcTypes.types', 'at least one type');
    for (const t of input.npcTypes.types) {
      if (!(t.weight > 0)) fail(`npcTypes.types.${t.type}.weight`, 'must be > 0');
    }
    checkPool('npcTypes.namePool', input.npcTypes.namePool);
  }
  if (input.namePool) checkPool('namePool', input.namePool);

  const p = input.params;
  if (p) {
    for (const key of ['occupancyRate', 'unemploymentRate'] as const) {
      const v = p[key];
      if (v !== undefined && !(v > 0 && v <= 1)) fail(`params.${key}`, 'must be in (0, 1]');
    }
    if (p.streetDensity !== undefined && !(p.streetDensity >= 0)) fail('params.streetDensity', 'must be >= 0');
    for (const key of ['femaleShare', 'sameGenderCoupleShare'] as const) {
      const v = p[key];
      if (v !== undefined && !(v >= 0 && v <= 1)) fail(`params.${key}`, 'must be in [0, 1]');
    }
  }
}

/** Runtime guard for JSON-loaded saves. The TypeScript type is not a trust boundary. */
export function validateSave(value: unknown): asserts value is SimulationSave {
  const save = record('save', value);
  exactKeys('save', save, ['version', 'seed', 'events']);
  if (save.version !== '1') fail('save.version', 'must be 1');
  string('save.seed', save.seed);
  if (!Array.isArray(save.events)) fail('save.events', 'must be an array');
  save.events.forEach((event, index) => validateEvent(record(`save.events.${index}`, event), index));
}

function validateEvent(event: Record<string, unknown>, index: number): asserts event is SaveEvent {
  const field = `save.events.${index}`;
  switch (event.k) {
    case 'crowd':
      exactKeys(field, event, ['k', 'crowdId', 'timeMin']);
      string(`${field}.crowdId`, event.crowdId);
      time(`${field}.timeMin`, event.timeMin);
      return;
    case 'vendor': {
      exactKeys(field, event, ['k', 'query']);
      const query = record(`${field}.query`, event.query);
      exactKeys(`${field}.query`, query, ['timeMin'], ['parcelId', 'type', 'role']);
      time(`${field}.query.timeMin`, query.timeMin);
      for (const key of ['parcelId', 'type', 'role'] as const) if (query[key] !== undefined) string(`${field}.query.${key}`, query[key]);
      return;
    }
    case 'npc':
      exactKeys(field, event, ['k', 'npcId']);
      string(`${field}.npcId`, event.npcId);
      return;
    case 'reserve': {
      exactKeys(field, event, ['k', 'spec']);
      const spec = record(`${field}.spec`, event.spec);
      exactKeys(`${field}.spec`, spec, ['name', 'type'], ['gender', 'homeDistrictId', 'jobParcelId', 'role']);
      const name = record(`${field}.spec.name`, spec.name);
      exactKeys(`${field}.spec.name`, name, ['given', 'family']);
      string(`${field}.spec.name.given`, name.given);
      string(`${field}.spec.name.family`, name.family);
      string(`${field}.spec.type`, spec.type);
      if (spec.gender !== undefined && spec.gender !== 'male' && spec.gender !== 'female') fail(`${field}.spec.gender`, 'must be male or female');
      for (const key of ['homeDistrictId', 'jobParcelId', 'role'] as const) if (spec[key] !== undefined) string(`${field}.spec.${key}`, spec[key]);
      return;
    }
    case 'flag': {
      exactKeys(field, event, ['k', 'npcId', 'op']);
      string(`${field}.npcId`, event.npcId);
      const op = record(`${field}.op`, event.op);
      if (op.kind === 'resign' || op.kind === 'die') exactKeys(`${field}.op`, op, ['kind']);
      else if (op.kind === 'promote') {
        exactKeys(`${field}.op`, op, ['kind'], ['toParcelId']);
        if (op.toParcelId !== undefined) string(`${field}.op.toParcelId`, op.toParcelId);
      } else if (op.kind === 'custom') {
        exactKeys(`${field}.op`, op, ['kind', 'tag']);
        string(`${field}.op.tag`, op.tag);
      } else fail(`${field}.op.kind`, 'unknown flag operation');
      return;
    }
    case 'interrupt':
    case 'resume':
      exactKeys(field, event, ['k', 'npcId', 'timeMin']);
      string(`${field}.npcId`, event.npcId);
      time(`${field}.timeMin`, event.timeMin);
      return;
    default:
      fail(`${field}.k`, 'unknown event kind');
  }
}

function record(field: string, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field, 'must be an object');
  return value as Record<string, unknown>;
}

function exactKeys(field: string, value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${field}.${key}`, 'required');
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${field}.${key}`, 'unexpected property');
}

function string(field: string, value: unknown): void {
  if (typeof value !== 'string') fail(field, 'must be a string');
}

function time(field: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(field, 'must be a finite number >= 0');
}
