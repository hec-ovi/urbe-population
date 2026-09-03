# Box map

- root box: the simulation library. See CONTRACT.md. Depends on Atlas, Connections, Interior and Naming contracts.
- `src/ui`: testbed frontend (views, widgets, components). See src/ui/CONTRACT.md.
  - depends on the root box through `src/ui/adapter/city-feed.ts` alone.
