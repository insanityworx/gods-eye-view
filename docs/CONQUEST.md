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

## Tactical assaults

From a running campaign, select an allied origin and a neighbouring hostile or
neutral sector, then choose **Command tactical assault**. The source keeps one
unit. A tactical assault deploys up to 24 troops against at most 36 defenders;
use the strategic advance option for larger engagements. The strategic clock
and its queues pause while the local battlefield is open.

Battles start paused. Press **Resume** when ready. The mint base is yours, the
coral base belongs to the AI, and gold cells contain ore. This first battlefield
is an authored 32 × 22 grid with rocks, roads and rough ground.

- Choose a building, then click a valid placement preview near an allied base.
  Buildings have footprints, costs and health; occupied cells cannot be built on.
- Power plants supply energy. Refineries, barracks, factories and turrets consume
  it. Insufficient power pauses production and turrets for either faction.
- Harvesters collect finite ore and must return it to an intact allied refinery
  before credits are awarded. They redirect to another deposit when one runs out.
- Select barracks to produce infantry, a war factory for tanks, or a refinery for
  more harvesters. Each building has one production queue. The limit is 64 units
  per faction, including harvesters and queued units.
- Click a unit, Shift-click to add/remove units, drag a box for group selection,
  or use **Select army** / **Select harvesters**. Click ground to order movement.
  **Attack-move** engages nearby enemies. Click an enemy for a focused attack.
  Select harvesters and click ore to assign a deposit.
- Keyboard: focus the battlefield, position the cell cursor with arrows and press
  Enter to issue an order or place a building. Escape clears selection/build mode.
- Infantry, tanks and turrets exchange simultaneous damage with health and attack
  cooldowns. Destroying the enemy command centre ends the battle. Capture requires
  surviving combat troops. The AI uses the same economy and command validation,
  builds its base and produces reinforcements; its first assault is after 30 seconds.
- Return after victory/defeat or confirm retreat. Surviving combat troops, enemy
  garrison and remaining credits carry back to the campaign. Each side reserves
  up to 300 of its actual campaign credits at deployment. Buildings and harvesters
  belong to the local theatre; surviving combat units become the sector garrison
  or return to the source after defeat/retreat. The campaign remains paused on return.
- Ore depletion is retained per sector across assaults. Roads and rough terrain
  change travel costs and speed for both sides. These are authored roads, not
  live OpenStreetMap data. Real network imports are a later integration.

The battlefield is SVG and does not require WebGL or provider keys. It runs from
pure JavaScript state with fixed 200ms steps, ready to embed in another web host.
There is currently no save/load across page reloads, native Unreal integration,
multiplayer, fog of war, audio, or persistent tactical building layout. Units use
four-way grid routing; this is not yet a full vehicle steering/collision model.

## Architecture and next milestones

- `src/conquest/simulation.js`: strategic campaign and queued orders.
- `src/conquest/battlefield.js`: deterministic tactical economy, routing, AI and combat.
- `src/conquest/sectorBattle.js`: deployment budgets and campaign outcome hand-off.
- `src/conquest/weather.js`: validated weather snapshot acquisition.
- `src/conquest/map.js`: keyless campaign globe and sector picking.
- `src/conquest/main.js`: runtime owner, lifecycle and both clocks.
- `src/ui/stores/conquest.js`, `ConquestView.vue` and `TacticalView.vue`: presentation.

Next: playtesting and balance, save/load and replay logs, fog of war, faction
identity, better unit steering and real road-data import. Licensed aggregate
environmental inputs and authoritative multiplayer can follow. Browser state is
single-player only; it is not an online authority.

## Verification

Run `node --import=./build/registerVue.js --test src/conquest/*.test.mjs` for the campaign-specific rules and
weather checks. Repository gates remain `npm test`, `npm run build` and
`npm run test:track` (the last needs the dev server and Chromium). The normal
observation-console entry point remains `/`.

## Current development checkpoint

The prototype UI is currently English. Its messages use the existing translation
API, but the 11 non-English catalogs still need the campaign and tactical entries; the
localization gate fails until those translations are supplied.

The tactical milestone has focused coverage of terrain routing, road speed,
placement, power and production, resource delivery/depletion, combat, AI,
deployment/retreat accounting, keyboard placement, drag selection and interface
controls. Production compilation and import-direction checks are also run.

The broader suite is still subject to the known missing-localization failures.
Browser rendering and the flight-tracking browser regression remain unverified
because the managed preview relay is unavailable in this workspace. Detailed
validation results are recorded in the draft pull request.
