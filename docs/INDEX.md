# Simulation index

| Box | Purpose | Inputs | Outputs | Dependencies |
| --- | --- | --- | --- | --- |
| [Simulation](../CONTRACT.md) | Computes population, identities and gameplay continuity. | [Request](../src/schemas/input.ts) | [Population](../src/schemas/population.ts), [crowd](../src/schemas/crowd.ts), [NPC](../src/schemas/npc.ts), [save](../src/schemas/simulation-save.schema.json) | Atlas blueprint, Connections networks, Interior NPC support, Naming types |
| [Testbed](../src/ui/CONTRACT.md) | Displays the fixture and selected person. | [CityFeed](../src/ui/adapter/types.ts), [view schema](../src/ui/ui/schema.ts) | Rendered page and selection/time events | Simulation through its feed adapter |

- [SKILL.md](../SKILL.md): library calls, defaults and a runnable example.
- [RESEARCH.md](RESEARCH.md): statistical defaults and their basis.
- [ISSUES.md](ISSUES.md): proposals requiring coordination and open product decisions.
