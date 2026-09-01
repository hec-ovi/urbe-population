/** The instanced NPC: identity, home, job, family, commutes. */

import { TextPanel } from '../components/text-panel.js';
import { dayName, formatHourMin } from '../components/time-format.js';
import type { NpcSummary } from '../adapter/types.js';

const MAX_COMMUTES = 3;

export class NpcCard {
  private readonly panel: TextPanel;

  constructor(root: HTMLElement) {
    this.panel = new TextPanel(root, 'NPC', 'nobody yet');
  }

  show(npc: NpcSummary): void {
    const family = npc.family
      .map((f) => `  ${f.relation}: ${f.name.given} ${f.name.family}${f.instantiated ? ' *' : ''}`)
      .join('\n');
    const commutes = [
      ...new Set(
        npc.commutes.map(
          (c) => `  ${dayName(c.day)} ${formatHourMin(c.startMin)} bus ${c.routeId} ${c.boardStopId}->${c.alightStopId}`,
        ),
      ),
    ].slice(0, MAX_COMMUTES);

    this.panel.setLines([
      `${npc.name.given} ${npc.name.family} (${npc.npcId})`,
      `type: ${npc.type}`,
      `home: ${npc.home.parcelId} unit ${npc.home.unit}`,
      `job: ${jobLine(npc)}`,
      npc.family.length ? `family:\n${family}` : 'family: none',
      commutes.length ? `commutes:\n${commutes.join('\n')}` : 'commutes: walks',
    ]);
  }

  showError(message: string): void {
    this.panel.setError(message);
  }
}

function jobLine(npc: NpcSummary): string {
  const job = npc.job;
  if (!job) return 'unemployed';
  const shift = `${job.shift.kind} ${formatHourMin(job.shift.startMin)}-${formatHourMin(job.shift.endMin)}`;
  return `${job.role} @ ${job.parcelId} (${shift}, days ${job.shift.days.join('')})`;
}
