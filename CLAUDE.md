# simulation: statistical NPC city (ABM)

You own this box. You build only what lives in this repo.

## Context (general, do not expand it)
This repo is one isolated layer of a larger build: a seeded, deterministic city world that ends as a playable 3D game (map, buildings, transit, NPCs, quests). Nine layers are built in parallel by separate sessions, each locked to its own repo, coupled only through CONTRACT.md files. Never read another layer's code or tests, only its CONTRACT.md. Your raw requirements are in docs/REQUIREMENTS.md, in the user's own words: they win over any summary here.

## Scope
- From the world blueprint, its path networks and the interior instance contracts, build the statistical population model: demographic groups per district and tier, employment mapping (who works where, shifts, opening hours, night-only places, 24/7 places need several employees plus security), families, unemployed, free time habits, which bus or subway each routine uses.
- Lazy instantiation, the core trick: thousands walk as cheap type-driven crowd agents, nothing is fully computed all the time. A specific NPC becomes a full instance only when the player interacts. At that moment it is assigned, statistically and deterministically from the seed plus the already-discovered set: a home, a job, a family, a full routine, a name. Names come from a pool and can repeat across different people.
- Once instanced, persistent: same face, same home, traceable whole life (follow the barista through opening the shop, the shift, the bus, home, sleep).
- Behavior state machines per type: inside a building the NPC runs the interior's routine placeholders, on the street the city path layer. Interruptible by player interaction, then resumes.
- Flags for quest-driven changes: resign job, promote and move to another building, dead (dead NPCs give no quests).
- Special pre-instanced NPCs supported: the quest layer can reserve one with a fixed name and story.
- Deliver as an embeddable library: the engine hosts the runtime. A future multiplayer source of truth (API, websocket) is noted in the contract as a possible evolution, not built now.

## Out of scope
No rendering, no dialog or LLM content (the quests layer owns that), no geometry, no pathfinding implementation (you consume path graphs).

## Depends on
../atlas/CONTRACT.md, ../connections/CONTRACT.md, ../interior/CONTRACT.md, ../naming/CONTRACT.md (NPC type strings)

## Consumers
../quests, ../engine

## Working order
1. Deep research first: 2026 state of the art on agent-based crowd simulation at scale, statistical population synthesis, level-of-detail simulation. Compact conclusions to docs/RESEARCH.md.
2. Draft CONTRACT.md before code: quests and engine are blocked on your query functions (getNPCVendor and family).
3. Implement with tests; first testbed runs on the 2D plane alone.
4. Keep CONTRACT.md and docs/INDEX.md current.

## Hard requirements
- Deterministic and statistical: same seed and same interaction order give the same population. Based on real demographic statistics from research.
- Standalone: runs against fixture blueprints with no other layer present.
- Cheap by default: full computation only for instanced NPCs.

## Coordination
- Read docs/FEEDBACK.md at the start of every session.
- Write blockers and cross-layer questions to docs/ISSUES.md.

## Master requirements (background only)
docs/FULL-REQUIREMENTS.md holds the user's complete raw requirements for the whole project, so you see your surroundings. Read it once for awareness. It never widens your scope: what you build is defined by this file and docs/REQUIREMENTS.md only.
