import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacent,
  createMatch,
  commandMatch,
  tickMatch,
} from './simulation.js';
const steps = (state, n, options = { ai: false }) => {
  for (let i = 0; i < n; i++) state = tickMatch(state, options);
  return state;
};

test('grid adjacency never wraps or crosses diagonals', () => {
  assert.equal(adjacent(0, 1), true);
  assert.equal(adjacent(0, 3), true);
  assert.equal(adjacent(2, 3), false);
  assert.equal(adjacent(0, 4), false);
});
test('invalid orders are atomic and cannot spend funds or steal sectors', () => {
  const state = createMatch();
  for (const command of [
    { type: 'train', sector: 8 },
    { type: 'move', sector: 0, target: 8, units: 9 },
    { type: 'move', sector: 0, target: 1, units: 10 },
    { type: 'move', sector: 0, target: 1, units: -1 },
    { type: 'move', sector: 0, target: 1, units: 1.5 },
  ]) {
    const result = commandMatch(state, command);
    assert.ok(result.error);
    assert.strictEqual(result.state, state);
  }
  assert.equal(state.factions.player.credits, 240);
  assert.equal(state.sectors[0].units, 10);
});
test('production spends once, queues once and completes at factory-specific time', () => {
  let state = commandMatch(createMatch(), { type: 'factory', sector: 0 }).state;
  state = commandMatch(state, { type: 'train', sector: 0 }).state;
  assert.equal(state.factions.player.credits, 80);
  assert.equal(
    commandMatch(state, { type: 'train', sector: 0 }).error,
    'production',
  );
  assert.equal(steps(state, 5).sectors[0].units, 10);
  assert.equal(steps(state, 6).sectors[0].units, 14);
});
test('capture arrives after transit, leaves a garrison, and carries aftermath', () => {
  const initial = createMatch();
  let state = commandMatch(initial, {
    type: 'move',
    sector: 0,
    target: 1,
    units: 9,
  }).state;
  assert.equal(initial.sectors[0].units, 10);
  assert.equal(state.sectors[0].units, 1);
  assert.equal(steps(state, 5).sectors[1].owner, 'neutral');
  state = steps(state, 6);
  assert.equal(state.sectors[1].owner, 'player');
  assert.equal(state.sectors[1].units, 7);
  assert.equal(state.sectors[1].infrastructure, 92);
  assert.equal(state.sectors[1].strain, 6);
});
test('defence wins ties and transfers reinforce without causing damage', () => {
  let state = createMatch();
  state.sectors[1].shield = 1;
  state = commandMatch(state, {
    type: 'move',
    sector: 0,
    target: 1,
    units: 5,
  }).state;
  assert.equal(steps(state, 6).sectors[1].owner, 'neutral');
  state = createMatch();
  state.sectors[1].owner = 'player';
  state = steps(
    commandMatch(state, { type: 'move', sector: 0, target: 1, units: 5 }).state,
    6,
  );
  assert.equal(state.sectors[1].units, 7);
  assert.equal(state.sectors[1].infrastructure, 100);
});
test('HQ capture ends the match and rejects further commands or ticks', () => {
  let state = createMatch();
  state.sectors[5].owner = 'player';
  state.sectors[5].units = 30;
  state = steps(
    commandMatch(state, { type: 'move', sector: 5, target: 8, units: 29 })
      .state,
    6,
  );
  assert.equal(state.winner, 'player');
  assert.equal(
    commandMatch(state, { type: 'train', sector: 0 }).error,
    'finished',
  );
  assert.strictEqual(tickMatch(state), state);
});
test('strategic strikes have prerequisites, cost, cooldown, aftermath and stability loss', () => {
  assert.equal(
    commandMatch(createMatch(), { type: 'strategic', sector: 8 }).error,
    'unavailable',
  );
  let state = createMatch({
    mode: 'total-war',
    snapshot: { source: 'synthetic', windKph: 40 },
  });
  state.factions.player.credits = 500;
  state = commandMatch(state, { type: 'strategic', sector: 8 }).state;
  assert.equal(state.factions.player.credits, 250);
  assert.equal(state.factions.player.cooldown, 60);
  assert.equal(state.factions.player.reputation, 70);
  assert.equal(state.sectors[8].owner, 'enemy');
  assert.equal(state.sectors[8].infrastructure, 35);
  assert.equal(state.sectors[8].strain, 38);
  assert.equal(
    commandMatch(state, { type: 'strategic', sector: 8 }).error,
    'unavailable',
  );
});
test('relief restores services and captured-sector production cannot change allegiance', () => {
  let state = createMatch();
  state.sectors[0].infrastructure = 50;
  state.sectors[0].strain = 60;
  state = commandMatch(state, { type: 'relief', sector: 0 }).state;
  assert.equal(state.sectors[0].infrastructure, 75);
  assert.equal(state.sectors[0].strain, 30);
  state = commandMatch(state, { type: 'train', sector: 0 }).state;
  state.sectors[0].owner = 'neutral';
  assert.equal(steps(state, 8).sectors[0].units, 10);
});
test('same snapshot and commands replay identically and AI expands', () => {
  const snapshot = {
    source: 'synthetic',
    windKph: 15,
    capturedAt: '2026-11-03T00:00:00Z',
  };
  const initial = createMatch({ snapshot });
  snapshot.windKph = 100;
  assert.equal(initial.snapshot.windKph, 15);
  const first = steps(initial, 48, { ai: true });
  assert.deepEqual(
    first,
    steps(createMatch({ snapshot: initial.snapshot }), 48, { ai: true }),
  );
  assert.ok(
    first.sectors.filter((sector) => sector.owner === 'enemy').length > 1,
  );
});
