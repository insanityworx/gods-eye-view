import { createUiRuntime } from '../ui/vueRuntime.js';
import { useConquestStore } from '../ui/stores/conquest.js';
import ConquestView from './ConquestView.vue';
import { createMatch, commandMatch, tickMatch } from './simulation.js';
import { captureWeather } from './weather.js';
import { createCampaignMap } from './map.js';
import { commandField, tickField } from './battlefield.js';
import { deploySectorBattle, settleSectorBattle } from './sectorBattle.js';
import './style.css';
import './tactical.css';

const runtime = createUiRuntime();
const store = useConquestStore(runtime.pinia);
let map;
let disposed = false;
let weatherController;
store.match = createMatch();
function select(id) {
  store.selected = id;
  if (store.match.sectors[id].owner === 'player') store.origin = id;
  store.error = '';
  map?.render(store.match, id);
}
function publish(state) {
  store.match = state;
  if (state.sectors[store.origin].owner !== 'player')
    store.origin =
      state.sectors.find((sector) => sector.owner === 'player')?.id ?? 0;
  map?.render(state, store.selected);
}
Object.assign(store.handlers, {
  select,
  battle() {
    if (store.paused || store.loading || store.battlefield) return;
    const result = deploySectorBattle(
      store.match,
      store.origin,
      store.selected,
    );
    if (result.error) {
      store.error = result.error;
      return;
    }
    publish(result.state);
    store.battlefield = result.battlefield;
    store.paused = true;
    store.tacticalPaused = true;
    store.selectedUnits = [];
    store.selectedBuilding = null;
    store.buildTool = null;
    store.tacticalError = '';
  },
  tacticalCommand(command) {
    if (store.tacticalPaused || !store.battlefield) {
      store.tacticalError = 'paused';
      return;
    }
    const result = commandField(store.battlefield, command);
    store.tacticalError = result.error ?? '';
    store.battlefield = result.state;
    if (!result.error && command.type === 'build') store.buildTool = null;
  },
  tacticalSelect(id, additive = false) {
    const entity = [
      ...store.battlefield.units,
      ...store.battlefield.buildings,
    ].find((u) => u.id === id);
    if (!entity) return;
    if (entity.owner !== 'player') {
      store.act('tacticalCommand', {
        type: 'attack',
        units: store.selectedUnits,
        target: id,
      });
      return;
    }
    store.buildTool = null;
    store.tacticalError = '';
    if (store.battlefield.buildings.includes(entity)) {
      store.selectedBuilding = id;
      store.selectedUnits = [];
      return;
    }
    store.selectedBuilding = null;
    store.selectedUnits = additive
      ? store.selectedUnits.includes(id)
        ? store.selectedUnits.filter((n) => n !== id)
        : [...store.selectedUnits, id]
      : [id];
  },
  tacticalBox(box, additive = false) {
    const ids = store.battlefield.units
      .filter(
        (u) =>
          u.owner === 'player' &&
          u.x >= box.x &&
          u.x <= box.x + box.width &&
          u.y >= box.y &&
          u.y <= box.y + box.height,
      )
      .map((u) => u.id);
    store.selectedBuilding = null;
    store.selectedUnits = [
      ...new Set([...(additive ? store.selectedUnits : []), ...ids]),
    ];
  },
  tacticalAll(kind) {
    store.selectedBuilding = null;
    store.buildTool = null;
    store.selectedUnits = store.battlefield.units
      .filter(
        (u) =>
          u.owner === 'player' &&
          (kind === 'harvester' ? u.kind === kind : u.kind !== 'harvester'),
      )
      .map((u) => u.id);
  },
  tacticalClick(x, y) {
    if (store.buildTool)
      store.act('tacticalCommand', {
        type: 'build',
        kind: store.buildTool,
        x,
        y,
      });
    else if (store.selectedUnits.length)
      store.act('tacticalCommand', {
        type: store.tacticalOrder,
        units: store.selectedUnits,
        x,
        y,
      });
  },
  leaveBattle(retreat = false) {
    const result = settleSectorBattle(store.match, store.battlefield, {
      retreat,
    });
    if (result.error) {
      store.tacticalError = result.error;
      return;
    }
    store.battlefield = null;
    publish(result.state);
    store.paused = true;
  },
  pause() {
    store.paused = !store.paused;
  },
  async start(mode) {
    if (store.loading) return;
    store.loading = true;
    store.paused = true;
    store.error = '';
    weatherController = new AbortController();
    const snapshot = await captureWeather({
      signal: AbortSignal.any([
        weatherController.signal,
        AbortSignal.timeout(8000),
      ]),
    });
    if (disposed) return;
    publish(createMatch({ mode, snapshot }));
    select(0);
    store.loading = false;
    store.paused = false;
  },
  command(type) {
    if (store.paused || store.loading) {
      store.error = 'paused';
      return;
    }
    const source = store.match.sectors[store.origin];
    const result = commandMatch(store.match, {
      type,
      sector: type === 'move' ? source.id : store.selected,
      target: store.selected,
      units: Math.max(1, source.units - 1),
    });
    store.error = result.error ?? '';
    publish(result.state);
  },
});
runtime.mount(ConquestView, document.getElementById('conquest-app'));
try {
  map = createCampaignMap(document.getElementById('campaign-globe'), select);
  map.render(store.match, 0);
} catch (error) {
  store.mapError = true;
  console.warn(
    'Campaign globe unavailable; sector controls remain playable.',
    error,
  );
}
const timer = setInterval(() => {
  if (!store.paused && !store.loading && !store.battlefield)
    publish(tickMatch(store.match));
}, 1000);
const tacticalTimer = setInterval(() => {
  if (store.battlefield && !store.tacticalPaused) {
    store.battlefield = tickField(store.battlefield);
    store.selectedUnits = store.selectedUnits.filter((id) =>
      store.battlefield.units.some((u) => u.id === id),
    );
  }
}, 200);
const hide = () => {
  if (document.hidden) {
    store.paused = true;
    store.tacticalPaused = true;
  }
};
document.addEventListener('visibilitychange', hide);
window.addEventListener(
  'pagehide',
  () => {
    disposed = true;
    weatherController?.abort();
    clearInterval(timer);
    clearInterval(tacticalTimer);
    document.removeEventListener('visibilitychange', hide);
    map?.destroy();
    runtime.destroy();
  },
  { once: true },
);
