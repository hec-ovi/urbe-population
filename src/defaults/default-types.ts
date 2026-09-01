/**
 * Built-in NPC type set and name pool for standalone runs (no naming layer).
 * Neutral modern theme; the naming layer replaces this with themed content.
 */

import type { NPCTypeSet } from '../schemas/npc-types.js';

/** Unisex names: they sit in the neutral bucket and in both gendered ones. */
const UNISEX = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Avery', 'Dana', 'Reese'];
const MALE = ['Marco', 'Theo', 'Felix', 'Oscar', 'Hugo', 'Elias', 'Ruben'];
const FEMALE = ['Lena', 'Ivy', 'Nora', 'Mira', 'Petra', 'Sofia', 'Clara'];

export const DEFAULT_TYPE_SET: NPCTypeSet = {
  meta: { theme: 'generic-modern', worldSeed: 'default', createdAt: '2026-08-31' },
  namePool: {
    given: [...UNISEX, ...MALE, ...FEMALE],
    givenByGender: {
      male: [...MALE, ...UNISEX],
      female: [...FEMALE, ...UNISEX],
      neutral: [...UNISEX],
    },
    family: [
      'Reyes', 'Okafor', 'Lindqvist', 'Tanaka', 'Moreau', 'Kovacs', 'Silva', 'Novak', 'Haddad', 'Petrov',
      'Larsen', 'Iglesias', 'Duarte', 'Kim', 'Weber', 'Rossi', 'Nakamura', 'Costa', 'Berg', 'Farah',
      'Vidal', 'Sato', 'Marek', 'Ortiz',
    ],
  },
  types: [
    { type: 'resident_low', label: 'Low-income resident', category: 'resident', boilerplate: 'You live in a modest home and know your block well.', grounding: { tiers: ['poor'] }, weight: 3 },
    { type: 'resident_mid', label: 'Resident', category: 'resident', boilerplate: 'You live an ordinary city life with settled routines.', grounding: { tiers: ['mid'] }, weight: 3 },
    { type: 'resident_high', label: 'Affluent resident', category: 'resident', boilerplate: 'You live comfortably and guard your time.', grounding: { tiers: ['rich', 'high_rich'] }, weight: 2 },
    { type: 'retiree', label: 'Retiree', category: 'resident', boilerplate: 'You are retired; your days are slow and local.', grounding: {}, weight: 1.5 },
    { type: 'office_worker', label: 'Office worker', category: 'worker', boilerplate: 'You work a desk job with regular hours.', grounding: { parcelTypes: ['offices'] }, weight: 3 },
    { type: 'corpo_employee', label: 'Corporate employee', category: 'worker', boilerplate: 'You work for a large corporation and mind its hierarchy.', grounding: { parcelTypes: ['corpo'] }, weight: 2 },
    { type: 'factory_worker', label: 'Factory worker', category: 'worker', boilerplate: 'You work shifts on a production floor.', grounding: { parcelTypes: ['factory'] }, weight: 2 },
    { type: 'medic_staff', label: 'Medical staff', category: 'worker', boilerplate: 'You work in healthcare; the shifts are long.', grounding: { parcelTypes: ['hospital', 'clinic'] }, weight: 1.5 },
    { type: 'hotel_staff', label: 'Hotel staff', category: 'worker', boilerplate: 'You keep a hotel running for its guests.', grounding: { parcelTypes: ['hotel'] }, weight: 1 },
    { type: 'barista', label: 'Barista', category: 'vendor', boilerplate: 'You run the counter of a coffee shop and know the regulars.', grounding: { parcelTypes: ['coffee_shop'] }, weight: 1.5 },
    { type: 'waiter', label: 'Waiter', category: 'vendor', boilerplate: 'You serve tables and read people fast.', grounding: { parcelTypes: ['restaurant'] }, weight: 1.5 },
    { type: 'shop_clerk', label: 'Shop clerk', category: 'vendor', boilerplate: 'You sell across a counter all day.', grounding: { parcelTypes: ['commerce', 'mall'] }, weight: 2 },
    { type: 'police_officer', label: 'Police officer', category: 'authority', boilerplate: 'You keep order on a beat you know street by street.', grounding: { parcelTypes: ['police'] }, weight: 1.5 },
    { type: 'soldier', label: 'Soldier', category: 'authority', boilerplate: 'You are stationed in the city under orders.', grounding: { parcelTypes: ['military'] }, weight: 1 },
    { type: 'security_guard', label: 'Security guard', category: 'authority', boilerplate: 'You watch doors and cameras through quiet hours.', grounding: {}, weight: 1.5 },
    { type: 'bus_driver', label: 'Bus driver', category: 'transit', boilerplate: 'You drive a fixed line and know its riders.', grounding: {}, weight: 1 },
    { type: 'street_wanderer', label: 'Street regular', category: 'street', boilerplate: 'You live mostly outdoors and see everything that happens.', grounding: { tiers: ['poor', 'mid'] }, weight: 1 },
  ],
};
