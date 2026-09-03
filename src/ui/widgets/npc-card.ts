/** The instanced NPC: structured identity, residence, job, household, and commutes. */

import { clear, el, kvRow, span } from '../components/dom.js';
import { toast } from '../components/toast.js';
import { dayName, formatHourMin } from '../components/time-format.js';
import type { NpcSummary } from '../adapter/types.js';

const MAX_COMMUTES = 4;

export class NpcCard {
  private readonly container = el('div', 'inspector-section npc-section');

  constructor(private readonly root: HTMLElement) {
    this.showEmpty();
    root.append(this.container);
  }

  showEmpty(): void {
    clear(this.container);
    const emptyBox = el('div', 'empty-state-box');
    const icon = el('div', 'empty-icon');
    icon.textContent = '⌖';
    const title = el('div', 'empty-title');
    title.textContent = 'NO NPC SELECTED';
    const desc = el('div', 'empty-desc');
    desc.textContent = 'Click any walking crowd agent on the map to lazily instantiate their full identity, or click a workplace parcel to query the on-duty worker.';
    emptyBox.append(icon, title, desc);
    this.container.append(emptyBox);
  }

  show(npc: NpcSummary): void {
    clear(this.container);
    this.container.classList.remove('is-error');

    // 1. Header with Name and Primary Badges
    const header = el('div', 'npc-header');
    const titleRow = el('div', 'npc-title-row');

    const nameEl = el('h2', 'npc-name');
    nameEl.textContent = `${npc.name.given} ${npc.name.family}`;

    const idBadge = el('span', 'badge badge-id');
    idBadge.textContent = `#${npc.npcId}`;
    titleRow.append(nameEl, idBadge);

    const tagsRow = el('div', 'npc-tags-row');
    const typeBadge = el('span', 'badge badge-primary');
    typeBadge.textContent = npc.type.toUpperCase();
    const genderBadge = el('span', 'badge badge-muted');
    genderBadge.textContent = npc.gender.toUpperCase();
    tagsRow.append(typeBadge, genderBadge);

    // Quick Action Tools
    const toolsRow = el('div', 'npc-tools-row');
    const copyIdBtn = el('button', 'btn-tool');
    copyIdBtn.type = 'button';
    copyIdBtn.textContent = 'Copy ID';
    copyIdBtn.title = 'Copy NPC ID to clipboard';
    copyIdBtn.addEventListener('click', () => {
      void navigator.clipboard?.writeText(npc.npcId);
      toast.success(`Copied NPC ID: ${npc.npcId}`);
    });

    const copyJsonBtn = el('button', 'btn-tool');
    copyJsonBtn.type = 'button';
    copyJsonBtn.textContent = 'JSON';
    copyJsonBtn.title = 'Copy JSON summary to clipboard';
    copyJsonBtn.addEventListener('click', () => {
      void navigator.clipboard?.writeText(JSON.stringify(npc, null, 2));
      toast.success(`Copied NPC JSON: ${npc.name.given} ${npc.name.family}`);
    });

    toolsRow.append(copyIdBtn, copyJsonBtn);
    header.append(titleRow, tagsRow, toolsRow);

    // 2. Identity & Residence Card
    const infoCard = el('div', 'card-block');
    const infoHead = el('div', 'card-block-title');
    infoHead.textContent = '// RESIDENCE';
    const infoBody = el('div', 'card-block-content');
    infoBody.append(
      kvRow('Home Parcel', npc.home.parcelId, 'mono-code'),
      kvRow('Living Unit', `Unit #${npc.home.unit}`, 'mono-code'),
    );
    infoCard.append(infoHead, infoBody);

    // 3. Employment / Workplace Card
    const jobCard = el('div', 'card-block');
    const jobHead = el('div', 'card-block-title');
    jobHead.textContent = '// EMPLOYMENT';
    const jobBody = el('div', 'card-block-content');

    if (npc.job) {
      const shiftTime = `${formatHourMin(npc.job.shift.startMin)} to ${formatHourMin(npc.job.shift.endMin)}`;
      const daysStr = npc.job.shift.days.map((d) => dayName(d)).join(' ');
      jobBody.append(
        kvRow('Role', npc.job.role, 'text-highlight'),
        kvRow('Workplace', npc.job.parcelId, 'mono-code'),
        kvRow('Shift Kind', `${npc.job.shift.kind.toUpperCase()} (${shiftTime})`),
        kvRow('Work Days', daysStr, 'mono-code'),
      );
    } else {
      const unemp = el('div', 'empty-inline');
      unemp.textContent = 'UNEMPLOYED / NO ACTIVE WORKPLACE';
      jobBody.append(unemp);
    }
    jobCard.append(jobHead, jobBody);

    // 4. Household & Kinship
    const familyCard = el('div', 'card-block');
    const familyHead = el('div', 'card-block-title');
    familyHead.textContent = `// HOUSEHOLD & KINSHIP (${npc.family.length})`;
    const familyBody = el('div', 'card-block-content');

    if (npc.family.length > 0) {
      const famList = el('div', 'list-block');
      for (const f of npc.family) {
        const item = el('div', 'list-item-row');
        const relBadge = el('span', 'badge badge-relation');
        relBadge.textContent = f.relation.toUpperCase();
        const fName = el('span', 'list-item-name');
        fName.textContent = `${f.name.given} ${f.name.family}`;
        const statusBadge = el('span', `badge ${f.instantiated ? 'badge-success' : 'badge-muted'}`);
        statusBadge.textContent = f.instantiated ? 'INSTANCED' : 'VIRTUAL';
        item.append(relBadge, fName, statusBadge);
        famList.append(item);
      }
      familyBody.append(famList);
    } else {
      const noFam = el('div', 'empty-inline');
      noFam.textContent = 'SOLITARY / NO CO-RESIDENT KIN';
      familyBody.append(noFam);
    }
    familyCard.append(familyHead, familyBody);

    // 5. Commute Schedule
    const commuteCard = el('div', 'card-block');
    const commuteHead = el('div', 'card-block-title');
    commuteHead.textContent = `// TRANSIT COMMUTES (${npc.commutes.length})`;
    const commuteBody = el('div', 'card-block-content');

    if (npc.commutes.length > 0) {
      const commuteList = el('div', 'list-block');
      const uniqueCommutes = [
        ...new Map(
          npc.commutes.map((c) => [
            `${c.day}-${c.startMin}-${c.routeId}-${c.boardStopId}-${c.alightStopId}`,
            c,
          ]),
        ).values(),
      ].slice(0, MAX_COMMUTES);

      for (const c of uniqueCommutes) {
        const item = el('div', 'list-item-row');
        const dayPill = el('span', 'badge badge-muted');
        dayPill.textContent = dayName(c.day).toUpperCase();
        const timeVal = el('span', 'mono-code');
        timeVal.textContent = formatHourMin(c.startMin);
        const routeBadge = el('span', 'badge badge-info');
        routeBadge.textContent = `BUS ${c.routeId.toUpperCase()}`;
        const routePath = el('span', 'commute-path');
        routePath.textContent = `${c.boardStopId} ➔ ${c.alightStopId}`;
        item.append(dayPill, timeVal, routeBadge, routePath);
        commuteList.append(item);
      }
      commuteBody.append(commuteList);
    } else {
      const noCommute = el('div', 'empty-inline');
      noCommute.textContent = 'WALKS / NO MOTOR TRANSIT ROUTE';
      commuteBody.append(noCommute);
    }
    commuteCard.append(commuteHead, commuteBody);

    this.container.append(header, infoCard, jobCard, familyCard, commuteCard);
    this.animate();
  }

  showError(message: string): void {
    clear(this.container);
    this.container.classList.add('is-error');
    const errBox = el('div', 'error-state-box');
    const tag = el('div', 'error-tag');
    tag.textContent = '[SIMULATION EXCEPTION]';
    const body = el('div', 'error-body');
    body.textContent = message;
    errBox.append(tag, body);
    this.container.append(errBox);
    this.animate();
  }

  private animate(): void {
    this.container.classList.remove('panel-flash');
    void this.container.offsetWidth;
    this.container.classList.add('panel-flash');
  }
}
