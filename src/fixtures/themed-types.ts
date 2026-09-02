/**
 * A themed NPC type set shaped like the one naming produces for the played
 * city: every type is themed and grounded, and no type is grounded on
 * restaurants or hotels, so a set with holes in it is the normal case.
 * Standalone runs and consumer tests use it to check that a worker's type
 * agrees with the post they hold.
 */

import type { NPCTypeSet } from '../schemas/npc-types.js';

export const FIXTURE_THEMED_TYPES: NPCTypeSet = {
  meta: { theme: 'harbour corpo', worldSeed: 'urbe-small', createdAt: '2026-09-02T00:00:00.000Z' },
  types: [
    {
      type: 'corpo_analyst',
      label: 'Corpo analyst',
      category: 'worker',
      boilerplate: 'You read numbers for a tower that owns your hours.',
      grounding: { parcelTypes: ['offices', 'corpo'] },
      weight: 3,
    },
    {
      type: 'mall_vendor',
      label: 'Mall vendor',
      category: 'vendor',
      boilerplate: 'You sell from a lit counter under a glass roof.',
      grounding: { parcelTypes: ['commerce', 'mall'] },
      weight: 2.5,
    },
    {
      type: 'corpo_coffee_barista',
      label: 'Corpo coffee barista',
      category: 'vendor',
      boilerplate: 'You pull coffee for badge holders in a hurry.',
      grounding: { parcelTypes: ['coffee_shop'] },
      weight: 1,
    },
    {
      type: 'harbour_crane_operator',
      label: 'Harbour crane operator',
      category: 'worker',
      boilerplate: 'You move containers from a cab above the water.',
      grounding: { parcelTypes: ['factory'] },
      weight: 2,
    },
    {
      type: 'clinic_nurse',
      label: 'Clinic nurse',
      category: 'worker',
      boilerplate: 'You keep a ward running through long shifts.',
      grounding: { parcelTypes: ['hospital', 'clinic'] },
      weight: 1.5,
    },
    {
      type: 'security_guard',
      label: 'Security guard',
      category: 'authority',
      boilerplate: 'You watch doors and cameras through the quiet hours.',
      grounding: {},
      weight: 1.5,
    },
    {
      type: 'harbour_patrol',
      label: 'Harbour patrol',
      category: 'authority',
      boilerplate: 'You walk the water line and check papers.',
      grounding: { parcelTypes: ['police', 'military'] },
      weight: 1,
    },
    {
      type: 'subway_tech',
      label: 'Subway tech',
      category: 'transit',
      boilerplate: 'You keep the tunnels running and hate the timetable.',
      grounding: {},
      weight: 1,
    },
    {
      type: 'transit_agent',
      label: 'Transit agent',
      category: 'transit',
      boilerplate: 'You sell fares and answer the same question all day.',
      grounding: {},
      weight: 0.5,
    },
    {
      type: 'renter',
      label: 'Renter',
      category: 'resident',
      boilerplate: 'You rent a room and keep your head down.',
      grounding: { tiers: ['poor', 'mid'] },
      weight: 3,
    },
    {
      type: 'exec_resident',
      label: 'Executive resident',
      category: 'resident',
      boilerplate: 'You live high up and pay for the quiet.',
      grounding: { tiers: ['rich', 'high_rich'] },
      weight: 2,
    },
    {
      type: 'street_eater',
      label: 'Street eater',
      category: 'street',
      boilerplate: 'You eat where the stalls are and see who passes.',
      grounding: {},
      weight: 1.5,
    },
  ],
  namePool: {
    given: [
      'Ilma', 'Sora', 'Vante', 'Nerissa', 'Kai', 'Dorel', 'Mirek', 'Tova', 'Ansel', 'Ruzena',
      'Bekim', 'Ondine', 'Faro', 'Lubina', 'Casimir', 'Nadja', 'Emrys', 'Sable', 'Torin', 'Yara',
    ],
    givenByGender: {
      male: ['Vante', 'Dorel', 'Mirek', 'Ansel', 'Bekim', 'Faro', 'Casimir', 'Emrys', 'Torin'],
      female: ['Ilma', 'Nerissa', 'Tova', 'Ruzena', 'Ondine', 'Lubina', 'Nadja', 'Yara'],
      neutral: ['Sora', 'Kai', 'Sable'],
    },
    family: [
      'Halvard', 'Quay', 'Brenner', 'Osk', 'Marlow', 'Vester', 'Anhalt', 'Rill', 'Petrov', 'Sund',
      'Baxa', 'Corvo', 'Delagoa', 'Ferrer', 'Grimm', 'Hollan', 'Iserlohn', 'Jarek', 'Kranz', 'Lund',
    ],
  },
};
