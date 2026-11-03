import '../testSupport/registerDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { useConquestStore } from '../ui/stores/conquest.js';
import { createBattlefield } from './battlefield.js';
import TacticalView from './TacticalView.vue';

function mount(t) {
  const pinia = createPinia();
  const store = useConquestStore(pinia);
  store.battlefield = createBattlefield();
  const host = document.body.appendChild(document.createElement('div'));
  const app = createApp(TacticalView).use(pinia);
  app.mount(host);
  t.after(() => {
    app.unmount();
    host.remove();
  });
  return { store, host };
}
test('tactical view offers construction and keyboard placement with cancellation', async (t) => {
  const { store, host } = mount(t);
  const calls = [];
  store.handlers.tacticalClick = (x, y) => calls.push([x, y]);
  const power = Array.from(
    host.querySelectorAll('.tactical-build button'),
  ).find((b) => b.textContent.includes('Power plant'));
  power.click();
  await nextTick();
  assert.equal(store.buildTool, 'power');
  const map = host.querySelector('.tactical-map');
  map.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
  );
  map.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  assert.deepEqual(calls, [[11, 12]]);
  map.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await nextTick();
  assert.equal(store.buildTool, null);
  store.tacticalPaused = true;
  await nextTick();
  assert.equal(power.disabled, true);
});
test('production panel shows the selected building and pauses actions during battle pause', async (t) => {
  const { store, host } = mount(t);
  const b = store.battlefield.buildings.find(
    (b) => b.owner === 'player' && b.kind === 'refinery',
  );
  store.selectedBuilding = b.id;
  const calls = [];
  store.handlers.tacticalCommand = (cmd) => calls.push(cmd);
  await nextTick();
  const button = host.querySelector('.tactical-train');
  assert.match(button.textContent, /Harvester/);
  button.click();
  assert.deepEqual(calls, [
    { type: 'train', kind: 'harvester', building: b.id },
  ]);
  store.tacticalPaused = true;
  await nextTick();
  assert.equal(button.disabled, true);
});
test('retreat requires two explicit clicks and finished battles offer campaign settlement', async (t) => {
  const { store, host } = mount(t);
  const calls = [];
  store.handlers.leaveBattle = (value) => calls.push(value);
  const retreat = host.querySelector('.retreat');
  retreat.click();
  await nextTick();
  assert.deepEqual(calls, []);
  assert.match(retreat.textContent, /Confirm/);
  retreat.click();
  assert.deepEqual(calls, [true]);
  store.battlefield = {
    ...store.battlefield,
    status: 'finished',
    winner: 'player',
  };
  await nextTick();
  host.querySelector('.tactical-outcome button').click();
  assert.deepEqual(calls, [true, false]);
});

test('drag selection forwards a box without issuing a movement click', async (t) => {
  const { store, host } = mount(t);
  const boxes = [],
    moves = [];
  store.handlers.tacticalBox = (box, additive) => boxes.push({ box, additive });
  store.handlers.tacticalClick = (x, y) => moves.push([x, y]);
  const map = host.querySelector('.tactical-map');
  map.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 1024,
    height: 704,
  });
  const pointer = (type, x, y) =>
    new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  map.dispatchEvent(pointer('pointerdown', 32, 32));
  map.dispatchEvent(pointer('pointermove', 128, 96));
  map.dispatchEvent(pointer('pointerup', 128, 96));
  map.dispatchEvent(pointer('click', 128, 96));
  assert.deepEqual(boxes, [
    { box: { x: 1, y: 1, width: 3, height: 2 }, additive: false },
  ]);
  assert.deepEqual(moves, []);
});
