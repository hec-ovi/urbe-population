/** Input validation: every failure is E_INVALID_INPUT naming the field. */

import { SimulationError } from '../schemas/errors.js';
import type { SimulationInput } from './simulation.js';

function fail(field: string, why: string): never {
  throw new SimulationError('E_INVALID_INPUT', `${field}: ${why}`, { field });
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

  if (input.networks) {
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
    if (input.npcTypes.namePool.given.length === 0 || input.npcTypes.namePool.family.length === 0) {
      fail('npcTypes.namePool', 'given and family pools must be non-empty');
    }
  }
  if (input.namePool && (input.namePool.given.length === 0 || input.namePool.family.length === 0)) {
    fail('namePool', 'given and family pools must be non-empty');
  }

  const p = input.params;
  if (p) {
    for (const key of ['occupancyRate', 'unemploymentRate'] as const) {
      const v = p[key];
      if (v !== undefined && !(v > 0 && v <= 1)) fail(`params.${key}`, 'must be in (0, 1]');
    }
    if (p.crowdScale !== undefined && !(p.crowdScale >= 0)) fail('params.crowdScale', 'must be >= 0');
  }
}
