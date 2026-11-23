import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD,
  BUILDINGS,
  TROOPS,
  createBattlefield,
  routeField,
  fieldTravelCost,
  commandField,
  tickField,
  fieldPower,
  fieldSurvivors,
} from './battlefield.js';
const step = (state, n, ai = false) => {
  for (let i = 0; i < n; i++) state = tickField(state, { ai });
  return state;
};
const troop = (state, owner = 'player', kind = 'infantry') =>
  state.units.find((u) => u.owner === owner && u.kind === kind);

test('deployment validates counts and starts both sides with working ore economy', () => {
  assert.throws(() => createBattlefield({ attackers: 0 }), /Invalid/);
  const state = createBattlefield({ attackers: 9, defenders: 3 });
  assert.equal(fieldSurvivors(state, 'player'), 9);
  assert.equal(fieldSurvivors(state, 'enemy'), 3);
  assert.equal(state.units.filter((u) => u.kind === 'harvester').length, 2);
  assert.ok(state.roads.length > 32);
  assert.ok(
    fieldPower(state, 'player').supply > fieldPower(state, 'player').demand,
  );
});
test('weighted routing prefers faster authored roads and avoids buildings/rocks', () => {
  const state = createBattlefield();
  state.buildings = [];
  state.rocks = [{ x: 4, y: 4 }];
  state.roads = Array.from({ length: 9 }, (_, x) => ({ x: x + 1, y: 3 }));
  state.rough = [];
  const path = routeField(state, { x: 1, y: 4 }, { x: 9, y: 4 });
  assert.ok(path.some((p) => p.y === 3));
  assert.ok(!path.some((p) => p.x === 4 && p.y === 4));
  const cost = path.reduce(
    (sum, p) => sum + fieldTravelCost(state, p.x, p.y),
    0,
  );
  assert.ok(cost < 10);
  assert.equal(routeField(state, { x: 1, y: 4 }, { x: 4, y: 4 }), null);
  state.rocks = Array.from({ length: FIELD.height }, (_, y) => ({ x: 4, y }));
  assert.equal(routeField(state, { x: 1, y: 4 }, { x: 9, y: 4 }), null);
});
test('construction requires funds, clear ground and proximity; rejected orders are atomic', () => {
  const state = createBattlefield();
  for (const cmd of [
    { type: 'build', kind: 'barracks', x: 2, y: 10 },
    { type: 'build', kind: 'factory', x: 31, y: 21 },
    { type: 'build', kind: 'power', x: 18, y: 0 },
    { type: 'build', kind: 'refinery', x: 8, y: 5 },
  ]) {
    const result = commandField(state, cmd);
    assert.ok(result.error);
    assert.strictEqual(result.state, state);
  }
  const result = commandField(state, {
    type: 'build',
    kind: 'barracks',
    x: 1,
    y: 16,
  });
  assert.equal(result.error, null);
  assert.equal(result.state.credits.player, 210);
  assert.equal(state.credits.player, 300);
  assert.ok(
    result.state.buildings.some(
      (b) =>
        b.kind === 'barracks' &&
        b.owner === 'player' &&
        b.x === 1 &&
        b.y === 16,
    ),
  );
});
test('production is charged once, queues once, honours power and spawns infantry', () => {
  let state = commandField(createBattlefield(), {
    type: 'build',
    kind: 'barracks',
    x: 1,
    y: 16,
  }).state;
  const barracks = state.buildings.find(
    (b) => b.kind === 'barracks' && b.owner === 'player',
  );
  assert.equal(
    commandField(state, { type: 'train', kind: 'tank', building: barracks.id })
      .error,
    'producer',
  );
  state = commandField(state, {
    type: 'train',
    kind: 'infantry',
    building: barracks.id,
  }).state;
  assert.equal(state.credits.player, 170);
  assert.equal(
    commandField(state, {
      type: 'train',
      kind: 'infantry',
      building: barracks.id,
    }).error,
    'queue',
  );
  assert.equal(fieldSurvivors(step(state, TROOPS.infantry.time), 'player'), 10);
  state.buildings.push({
    id: state.nextId++,
    owner: 'player',
    kind: 'factory',
    x: 12,
    y: 18,
    hp: 340,
    queue: null,
    cooldown: 0,
  });
  state.buildings.push({
    id: state.nextId++,
    owner: 'player',
    kind: 'factory',
    x: 18,
    y: 18,
    hp: 340,
    queue: null,
    cooldown: 0,
  });
  state.buildings = state.buildings.filter(
    (b) => !(b.owner === 'player' && b.kind === 'power'),
  );
  assert.ok(
    fieldPower(state, 'player').demand > fieldPower(state, 'player').supply,
  );
  assert.equal(
    step(state, 10).buildings.find((b) => b.id === barracks.id).queue.remaining,
    TROOPS.infantry.time,
  );
});
test('harvesters must carry finite ore back to an intact refinery for credits', () => {
  let state = createBattlefield();
  const original = state.resources.reduce((s, p) => s + p.amount, 0);
  state = step(state, 220);
  assert.ok(state.credits.player > 300);
  assert.ok(state.resources.reduce((s, p) => s + p.amount, 0) < original);
  assert.ok(troop(state, 'player', 'harvester').cargo <= 50);
  let stopped = createBattlefield();
  stopped.buildings = stopped.buildings.filter(
    (b) => !(b.owner === 'player' && b.kind === 'refinery'),
  );
  stopped = step(stopped, 220);
  assert.equal(stopped.credits.player, 300);
});
test('movement respects ownership, has distinct formation destinations and follows a route', () => {
  let state = createBattlefield();
  const soldiers = state.units.filter(
    (u) => u.owner === 'player' && u.kind === 'infantry',
  );
  assert.equal(
    commandField(state, {
      type: 'move',
      units: [troop(state, 'enemy').id],
      x: 15,
      y: 12,
    }).error,
    'selection',
  );
  state = commandField(state, {
    type: 'move',
    units: soldiers.slice(0, 3).map((u) => u.id),
    x: 13,
    y: 10,
  }).state;
  assert.equal(
    new Set(
      state.units
        .filter((u) => soldiers.slice(0, 3).some((s) => s.id === u.id))
        .map((u) => `${u.order.x},${u.order.y}`),
    ).size,
    3,
  );
  state = step(state, 60);
  for (const soldier of soldiers.slice(0, 3)) {
    const actual = state.units.find((u) => u.id === soldier.id);
    assert.ok(actual.x > 10);
    assert.ok(actual.hp > 0);
  }
});
test('simultaneous combat can destroy both units, with no attacks against allies', () => {
  let state = createBattlefield({ attackers: 1, defenders: 1 });
  const a = troop(state),
    b = troop(state, 'enemy');
  a.x = 12;
  a.y = 10;
  b.x = 14;
  b.y = 10;
  a.hp = 7;
  b.hp = 7;
  state.units = [a, b];
  assert.equal(
    commandField(state, { type: 'attack', units: [a.id], target: a.id }).error,
    'target',
  );
  state = tickField(state, { ai: false });
  assert.equal(state.units.length, 0);
  assert.equal(state.shots.length, 2);
});
test('focused attacks and command-centre destruction complete the battle', () => {
  let state = createBattlefield({ attackers: 1, defenders: 0 });
  const attacker = troop(state);
  const hq = state.buildings.find(
    (b) => b.owner === 'enemy' && b.kind === 'hq',
  );
  attacker.x = 25;
  attacker.y = 10;
  hq.hp = 7;
  state = commandField(state, {
    type: 'attack',
    units: [attacker.id],
    target: hq.id,
  }).state;
  state = tickField(state, { ai: false });
  assert.equal(state.status, 'finished');
  assert.equal(state.winner, 'player');
  assert.strictEqual(tickField(state), state);
  assert.equal(
    commandField(state, { type: 'stop', units: [attacker.id] }).error,
    'finished',
  );
});
test('AI obeys the shared build, production, economy and movement rules', () => {
  const initial = createBattlefield({ attackers: 8, defenders: 8 });
  const state = step(initial, 180, true);
  assert.ok(
    state.buildings.some((b) => b.owner === 'enemy' && b.kind === 'factory'),
  );
  assert.ok(
    state.units.some((u) => u.owner === 'enemy' && u.order?.type === 'attack'),
  );
  assert.ok(
    state.units.filter((u) => u.owner === 'enemy' && u.kind === 'infantry')
      .length >= 8,
  );
  assert.ok(state.credits.enemy >= 0);
  assert.deepEqual(
    state,
    step(createBattlefield({ attackers: 8, defenders: 8 }), 180, true),
  );
});

test('war factories produce tanks and depleted ore fields redirect harvesters', () => {
  let state = createBattlefield();
  state.credits.player = 500;
  state = commandField(state, {
    type: 'build',
    kind: 'factory',
    x: 1,
    y: 16,
  }).state;
  const factory = state.buildings.find(
    (b) => b.owner === 'player' && b.kind === 'factory',
  );
  state = commandField(state, {
    type: 'train',
    kind: 'tank',
    building: factory.id,
  }).state;
  state = step(state, TROOPS.tank.time);
  assert.equal(
    state.units.filter((u) => u.owner === 'player' && u.kind === 'tank').length,
    1,
  );
  let depleted = createBattlefield();
  depleted.resources[0].amount = 2;
  depleted = step(depleted, 300);
  assert.equal(depleted.resources[0].amount, 0);
  assert.ok(depleted.resources[2].amount < 500);
  assert.ok(depleted.credits.player > 300);
});

test('roads increase actual travel speed and finite ore cannot create extra credits', () => {
  let road = createBattlefield();
  const unit = troop(road);
  unit.x = 12;
  unit.y = 10;
  road.units = [unit];
  road = commandField(road, {
    type: 'move',
    units: [unit.id],
    x: 13,
    y: 10,
  }).state;
  const ground = structuredClone(road);
  ground.roads = [];
  assert.ok(
    tickField(road, { ai: false }).units[0].x >
      tickField(ground, { ai: false }).units[0].x,
  );
  let finite = createBattlefield();
  finite.units = finite.units.filter(
    (u) => u.owner === 'player' && u.kind === 'harvester',
  );
  for (const patch of finite.resources) patch.amount = 0;
  finite.resources[0].amount = 2;
  finite = step(finite, 160);
  assert.equal(finite.credits.player, 302);
  assert.equal(
    finite.resources.reduce((sum, p) => sum + p.amount, 0),
    0,
  );
});
