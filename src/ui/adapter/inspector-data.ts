import config from '../components/inspector.json' with { type: 'json' };
import { dayName, formatHourMin } from './time-format.js';
import type { BehaviorSummary, NpcSummary } from './types.js';
import type { ViewData } from '../ui/schema.js';

export function inspectorData(npc?: NpcSummary, state?: BehaviorSummary | null, error?: string): ViewData {
  const fields: Record<string, string> = {
    home: npc?.home.parcelId ?? '', unit: String(npc?.home.unit ?? ''),
    role: npc?.job?.role ?? '', workplace: npc?.job?.parcelId ?? '',
    shift: npc?.job ? `${formatHourMin(npc.job.shift.startMin)} to ${formatHourMin(npc.job.shift.endMin)}` : '',
    days: npc?.job?.shift.days.map(dayName).join(' ') ?? '',
  };
  const lists: Record<string, { label: string; value: string }[]> = {
    familyRows: npc?.family.map((person) => ({ label: person.relation,
      value: `${person.name.given} ${person.name.family} (${person.instantiated ? 'instanced' : 'virtual'})`,
    })) ?? [],
    commuteRows: npc?.commutes.map((leg) => ({ label: `${dayName(leg.day)} ${formatHourMin(leg.startMin)}`,
      value: `${leg.routeId}: ${leg.boardStopId} to ${leg.alightStopId}`,
    })) ?? [],
  };
  const sections = npc ? config.sections.map((section) => ({
    title: section.title,
    rows: section.each ? lists[section.each] : section.rows!.map((row) => ({ label: row.label, value: fields[row.key] })),
  })) : [];
  const behaviorFields: Record<string, string> = { location: state ? `${state.place.kind}: ${state.place.id}` : '' };
  if (state?.interior?.kind === 'at') {
    behaviorFields.anchor = state.interior.anchorId;
    behaviorFields.animation = state.interior.animation;
  }
  if (state?.interior?.kind === 'walk') behaviorFields.walk = `${state.interior.fromAnchorId} to ${state.interior.toAnchorId}`;
  return {
    empty: !npc && !error, error, person: Boolean(npc), npcId: npc?.npcId,
    name: npc && `${npc.name.given} ${npc.name.family}`, type: npc?.type, gender: npc?.gender,
    sections, behavior: Boolean(state),
    behaviorRows: config.behaviorRows.filter((row) => behaviorFields[row.key]).map((row) => ({ label: row.label, value: behaviorFields[row.key] })),
    activity: state?.activity.toUpperCase(), mode: state?.mode.toUpperCase(),
    interrupted: state?.interrupted, untracked: Boolean(npc) && state === null,
  };
}
