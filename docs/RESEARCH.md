# Statistical defaults

These are model choices, not a measured census of the generated city. Values live in [population/defaults.ts](../src/population/defaults.ts); caller overrides are in [SKILL.md](../SKILL.md).

| Setting | Basis |
| --- | --- |
| Household weights .29/.27/.21/.10/.13 | Approximation using ACS 2024 household composition; weights represent single, couple, couple with children, lone parent and shared homes. |
| Occupancy .55; unit areas 45/70/110/180 m² | Fictional city housing assumptions by wealth tier. Calibration scales the estimated stock toward Atlas's population. |
| Female share .51; same-gender couple share .03 | City-level modeling choices informed by UN WPP 2024 and Census household estimates. Partners share one household draw. |
| Adult labor-force participation .64; unemployment .041 | ACS/BLS-inspired baseline. The public unemployment total includes adults outside the labor force. |
| Rota | Up to 8 hours per wave, 5 days per crew; a 24/7 post uses 3 waves and 2 crews. Office shifts allow 9 hours including a break. Capacity can leave slots unfilled. |
| Transit fallback | 12-minute headway, estimated bus/rail speed and 05:00 to midnight service. Supplied networks provide route times instead. |

[Street presence](../src/crowd/presence.ts) uses authored time-of-day curves informed by NHAPS time-location budgets and NHTS travel patterns. Counts include an allowance for car travel as public presence. `streetDensity` scales those curves. Parcel frontage attracts nearby presence; it is not a pedestrian census or a physical crowd-capacity certificate.

Household and job indices use seeded permutations. Full biographies are allocated on interaction. Household prefix arrays, initial adult type counting and job-slot indexing grow with population. [CONTRACT.md](../CONTRACT.md) states the runtime limits; [ISSUES.md](ISSUES.md) tracks public accounting and performance questions.
