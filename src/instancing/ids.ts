/** NPC id codec: adults are a<index>, kids are k<group>.<household>.<child>. */

const ADULT_ID = /^a(\d+)$/;
const KID_ID = /^k(\d+)\.(\d+)\.(\d+)$/;

export function adultId(adultIdx: number): string {
  return `a${adultIdx}`;
}

export function kidId(groupIdx: number, h: number, i: number): string {
  return `k${groupIdx}.${h}.${i}`;
}

export function parseAdultId(npcId: string): number | undefined {
  const m = ADULT_ID.exec(npcId);
  return m ? Number(m[1]) : undefined;
}

export function parseKidId(npcId: string): { groupIdx: number; h: number; i: number } | undefined {
  const m = KID_ID.exec(npcId);
  return m ? { groupIdx: Number(m[1]), h: Number(m[2]), i: Number(m[3]) } : undefined;
}
