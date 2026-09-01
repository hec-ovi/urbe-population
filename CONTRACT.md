# CONTRACT: simulation

Purpose: statistical NPC population with lazy instantiation: crowds run cheap by type, a specific NPC gets a full deterministic life (home, job, family, routine, name) only on interaction.

Status: draft, schemas pending research.

## In (must cover)
- seed
- world blueprint (zones, buildings) and path networks
- interior instance routine contracts
- NPC type strings with statistics (from naming)

## Out (must cover)
- population statistics per district and tier
- crowd state per time of day (who is where, doing what, by type)
- instantiation call: NPC id to full instance (home, job, family, routine, name, type)
- query functions for the agentic layers: get NPCs by type, by place, by schedule (getNPCVendor style)
- flag updates: job change, move, dead

## Errors
Closed set, to be defined.

## Depends on
- ../atlas/CONTRACT.md
- ../connections/CONTRACT.md
- ../interior/CONTRACT.md
- ../naming/CONTRACT.md
