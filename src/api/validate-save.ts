import { checkAppearanceSeed, fail } from './invalid-input.js';
import type { SaveEvent, SimulationSave } from '../instancing/registry.js';

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
      exactKeys(field, event, ['k', 'crowdId', 'timeMin'], ['appearanceSeed']);
      string(`${field}.crowdId`, event.crowdId);
      time(`${field}.timeMin`, event.timeMin);
      if (event.appearanceSeed !== undefined) checkAppearanceSeed(`${field}.appearanceSeed`, event.appearanceSeed);
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
