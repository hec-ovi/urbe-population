/** Input validation: every failure is E_INVALID_INPUT naming the field. */

import { fail } from './invalid-input.js';
import { resolvePool } from '../instancing/name-pool.js';
import type { NamePool } from '../schemas/npc-types.js';
import type { SimulationInput } from '../schemas/input.js';

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
    if (p.maxInstances !== undefined && !(Number.isInteger(p.maxInstances) && p.maxInstances >= 1)) {
      fail('params.maxInstances', 'must be an integer >= 1');
    }
    for (const key of ['femaleShare', 'sameGenderCoupleShare'] as const) {
      const v = p[key];
      if (v !== undefined && !(v >= 0 && v <= 1)) fail(`params.${key}`, 'must be in [0, 1]');
    }
  }
}
