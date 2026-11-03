import { createUiRuntime } from '../ui/vueRuntime.js';
import { useConquestStore } from '../ui/stores/conquest.js';
import ConquestView from './ConquestView.vue';
import { createMatch, commandMatch, tickMatch } from './simulation.js';
import { captureWeather } from './weather.js';
import { createCampaignMap } from './map.js';
import './style.css';

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
  if (!store.paused && !store.loading) publish(tickMatch(store.match));
}, 1000);
const hide = () => {
  if (document.hidden) store.paused = true;
};
document.addEventListener('visibilitychange', hide);
window.addEventListener(
  'pagehide',
  () => {
    disposed = true;
    weatherController?.abort();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', hide);
    map?.destroy();
    runtime.destroy();
  },
  { once: true },
);
