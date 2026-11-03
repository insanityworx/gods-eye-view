# God's Eye: Conquest — first playable slice

This branch develops a C&C-inspired game alongside the existing observation console.
Open `/conquest.html` after `npm ci` and `npm run dev`. Node 24.14+ or 26 is required.
`npm run build` includes both HTML entry points. No provider keys are needed.

## Play

1. Choose Conquest or Total war and launch. Starting again replaces the match.
2. Aster is your HQ; Ion is the AI HQ. Capture Ion to win. Losing Aster ends play.
3. Select an allied sector as your dispatch origin, then a neighbouring destination.
   Advance sends every unit except one. Formations arrive after six game seconds.
   Horizontal and vertical neighbours connect; diagonals do not.
4. Refineries produce credits every four seconds, scaled by infrastructure and
   faction stability. Factories train four units at a time. Upgrading factories
   reduces training from eight to six to four seconds. Defence grids add strength.
5. Captured sectors retain their buildings. Repair and civilian relief restores
   infrastructure and reduces relief strain. One production queue per sector.
6. Combat raises escalation. At 70, strategic strikes become available for 250
   credits and require two button presses. They severely damage abstract game
   infrastructure, reduce garrisons and faction stability, and have a 60-second
   cooldown. They do not capture territory. Total war begins at escalation 75;
   its AI may use strategic strikes. In Conquest, a first strike permits retaliation.
7. Pause with the top-right button. Switching away pauses the simulation. The
   sector grid remains playable if WebGL is unavailable.

Defenders win ties. Conventional attacks consume an attacker's dispatched force
and reduce a surviving defence. Capturing a sector requires more attacking units
than its garrison plus three per defence-grid level. Training is lost when its
sector changes ownership before completion.

## Data contract

Only the weather is live in this slice. Launch requests the existing
`/api/weather-effects?latitude=51&longitude=0` route. A validated wind reading with
an observation timestamp no more than two hours old is copied into the match.
Failures, stale responses, missing values and timeouts use 15 km/h synthetic wind.
The UI names the source and observation time; it never labels fallback data live.
No weather refresh occurs during a match.

This is one theatre sample, not a per-sector forecast. At 30 km/h and above, the
fictional emergency-response strain modifier rises to 1.25. Exposure classes,
armies and sector boundaries are authored game data. No live civilian tracks,
real military assets, casualty predictions, weapon yields or fallout calculations
enter the simulation. The globe uses Cesium's bundled Natural Earth imagery.

Source code retains the upstream MIT license. Upstream third-party datasets and
models retain their own terms; the prototype does not consume them. Review
`LICENSE` and `DATA_SOURCES.md` before selecting data for a distributed release.

## Architecture and next milestones

- `src/conquest/simulation.js`: pure fixed-step commands and simulation, with AI.
- `src/conquest/weather.js`: bounded, validated weather snapshot acquisition.
- `src/conquest/map.js`: keyless globe renderer and sector picking.
- `src/conquest/main.js`: runtime owner, lifecycle and clock.
- `src/ui/stores/conquest.js` and `src/conquest/ConquestView.vue`: presentation.

Next: save/load and replay command logs; tactical battlefields with individual
unit movement and construction; distinct factions and richer AI; licensed,
aggregate environmental inputs; then authoritative multiplayer with lobby,
shared snapshot IDs, server-side command validation and reconnect. The present
browser-owned state is single-player only and is not an online authority.

## Verification

Run `node --test src/conquest/*.test.mjs` for the campaign-specific rules and
weather checks. Repository gates remain `npm test`, `npm run build` and
`npm run test:track` (the last needs the dev server and Chromium). The normal
observation-console entry point remains `/`.

## Current development checkpoint

The prototype UI is currently English. Its messages use the existing translation
API, but the 11 non-English catalogs still need the new campaign entries; the
localization gate fails until those translations are supplied.

At this checkpoint, production compilation, package boundaries, 18 focused
campaign/interface/panel tests, and four world-label policy tests pass. The broad
suite reported 9,825 passing, two skipped and 12 failing tests: 11 catalog checks
and the label policy check. The label policy failure was subsequently fixed and
its four tests rerun successfully. The broad suite has not been rerun after that
fix. Browser rendering and the flight-tracking browser regression remain
unverified because the managed preview relay is unavailable in this workspace.
