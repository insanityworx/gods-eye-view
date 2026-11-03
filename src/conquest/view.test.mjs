import '../testSupport/registerDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { useConquestStore } from '../ui/stores/conquest.js';
import { createMatch } from './simulation.js';
import ConquestView from './ConquestView.vue';

test('view exposes playable fallback, launch and paused production controls', async (t) => {
  const pinia = createPinia();
  const store = useConquestStore(pinia);
  store.match = createMatch();
  store.mapError = true;
  let launched;
  store.handlers.start = (mode) => {
    launched = mode;
  };
  const host = document.body.appendChild(document.createElement('div'));
  const app = createApp(ConquestView).use(pinia);
  app.mount(host);
  t.after(() => {
    app.unmount();
    host.remove();
  });
  assert.equal(host.querySelectorAll('.sector-cell').length, 9);
  assert.match(host.querySelector('.map-fallback').textContent, /sector grid/);
  assert.equal(host.querySelector('.sector-panel button').disabled, true);
  host.querySelector('.start').click();
  assert.equal(launched, 'conquest');
  store.paused = false;
  await nextTick();
  assert.equal(host.querySelector('.sector-panel button').disabled, false);
});

test('strategic strike requires arming and an explicit second click', async (t) => {
  const pinia = createPinia();
  const store = useConquestStore(pinia);
  store.match = createMatch({ mode: 'total-war' });
  store.match.factions.player.credits = 300;
  store.selected = 8;
  store.paused = false;
  const calls = [];
  store.handlers.command = (type) => calls.push(type);
  const host = document.body.appendChild(document.createElement('div'));
  const app = createApp(ConquestView).use(pinia);
  app.mount(host);
  t.after(() => {
    app.unmount();
    host.remove();
  });
  const button = host.querySelector('.danger');
  assert.equal(button.disabled, false);
  button.click();
  await nextTick();
  assert.deepEqual(calls, []);
  assert.match(button.textContent, /Confirm/);
  button.click();
  await nextTick();
  assert.deepEqual(calls, ['strategic']);
});
