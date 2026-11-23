/** Small deterministic RTS battlefield. Coordinates are fictional grid cells. */
export const FIELD = Object.freeze({
  width: 32,
  height: 22,
  step: 0.2,
  limit: 64,
});
export const BUILDINGS = Object.freeze({
  hq: { size: 3, hp: 600, cost: 0, power: 10, drain: 0 },
  power: { size: 2, hp: 180, cost: 70, power: 12, drain: 0 },
  refinery: { size: 2, hp: 260, cost: 110, power: 0, drain: 4 },
  barracks: { size: 2, hp: 220, cost: 90, power: 0, drain: 3 },
  factory: { size: 3, hp: 340, cost: 180, power: 0, drain: 6 },
  turret: {
    size: 1,
    hp: 160,
    cost: 100,
    power: 0,
    drain: 3,
    range: 5,
    damage: 10,
    reload: 5,
  },
});
export const TROOPS = Object.freeze({
  infantry: {
    hp: 50,
    cost: 40,
    speed: 2,
    range: 3.6,
    damage: 7,
    reload: 5,
    time: 25,
    producer: 'barracks',
  },
  tank: {
    hp: 170,
    cost: 140,
    speed: 1.5,
    range: 4.5,
    damage: 22,
    reload: 9,
    time: 50,
    producer: 'factory',
  },
  harvester: {
    hp: 120,
    cost: 90,
    speed: 1.7,
    range: 0,
    damage: 0,
    reload: 0,
    time: 35,
    producer: 'refinery',
  },
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const enemyOf = (owner) => (owner === 'player' ? 'enemy' : 'player');
const inside = (x, y, size = 1) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x >= 0 &&
  y >= 0 &&
  x + size <= FIELD.width &&
  y + size <= FIELD.height;
function occupied(state, x, y) {
  return (
    state.rocks.some((r) => r.x === x && r.y === y) ||
    state.buildings.some(
      (b) =>
        b.hp > 0 &&
        x >= b.x &&
        x < b.x + BUILDINGS[b.kind].size &&
        y >= b.y &&
        y < b.y + BUILDINGS[b.kind].size,
    )
  );
}
function centre(item) {
  const size = BUILDINGS[item.kind]?.size ?? 1;
  return { x: item.x + (size - 1) / 2, y: item.y + (size - 1) / 2 };
}
function neighbours(x, y) {
  return [
    [x - 1, y],
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
  ].filter(([a, b]) => inside(a, b));
}

/** Find a four-way route around buildings and terrain, or null if unreachable. */
export function routeField(state, from, goal) {
  const start = [Math.round(from.x), Math.round(from.y)];
  if (
    !inside(...start) ||
    !inside(goal.x, goal.y) ||
    occupied(state, goal.x, goal.y)
  )
    return null;
  const key = (x, y) => y * FIELD.width + x;
  const blocked = new Set(state.rocks.map((p) => key(p.x, p.y)));
  for (const b of state.buildings.filter((b) => b.hp > 0))
    for (let y = b.y; y < b.y + BUILDINGS[b.kind].size; y++)
      for (let x = b.x; x < b.x + BUILDINGS[b.kind].size; x++)
        blocked.add(key(x, y));
  const roads = new Set((state.roads ?? []).map((p) => key(p.x, p.y)));
  const rough = new Set((state.rough ?? []).map((p) => key(p.x, p.y)));
  const previous = new Map([[key(...start), null]]);
  const costs = new Map([[key(...start), 0]]);
  const queue = [{ x: start[0], y: start[1], cost: 0 }];
  const settled = new Set();
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
    const { x, y, cost } = queue.shift();
    const current = key(x, y);
    if (settled.has(current)) continue;
    settled.add(current);
    if (x === goal.x && y === goal.y) {
      const path = [];
      let cursor = current;
      while (previous.get(cursor) !== null) {
        path.unshift({
          x: cursor % FIELD.width,
          y: Math.floor(cursor / FIELD.width),
        });
        cursor = previous.get(cursor);
      }
      return path;
    }
    for (const [a, b] of neighbours(x, y)) {
      const next = key(a, b);
      if (blocked.has(next) || settled.has(next)) continue;
      const nextCost =
        cost + (roads.has(next) ? 0.65 : rough.has(next) ? 1.6 : 1);
      if (nextCost >= (costs.get(next) ?? Infinity)) continue;
      costs.set(next, nextCost);
      previous.set(next, current);
      queue.push({ x: a, y: b, cost: nextCost });
    }
  }
  return null;
}
function freeNear(state, point) {
  const spots = [];
  for (let y = 0; y < FIELD.height; y++)
    for (let x = 0; x < FIELD.width; x++)
      if (!occupied(state, x, y)) spots.push({ x, y });
  return spots.sort(
    (a, b) => distance(a, point) - distance(b, point) || a.y - b.y || a.x - b.x,
  );
}
/** Authored roads lower route costs; rough terrain slows every faction equally. */
export function fieldTravelCost(state, x, y) {
  if (state.roads?.some((p) => p.x === x && p.y === y)) return 0.65;
  return state.rough?.some((p) => p.x === x && p.y === y) ? 1.6 : 1;
}
function spawnSpot(state, point) {
  return freeNear(state, point).find(
    (p) =>
      !state.units.some(
        (u) => Math.round(u.x) === p.x && Math.round(u.y) === p.y,
      ),
  );
}
function addBuilding(state, owner, kind, x, y) {
  const building = {
    id: state.nextId++,
    owner,
    kind,
    x,
    y,
    hp: BUILDINGS[kind].hp,
    queue: null,
    cooldown: 0,
  };
  state.buildings.push(building);
  return building;
}
function addTroop(state, owner, kind, spot) {
  const troop = {
    id: state.nextId++,
    owner,
    kind,
    x: spot.x,
    y: spot.y,
    hp: TROOPS[kind].hp,
    cooldown: 0,
    path: [],
    order: null,
    cargo: 0,
  };
  state.units.push(troop);
  return troop;
}
function beginGather(state, unit, patch) {
  unit.order = { type: 'gather', patch: patch.id, phase: 'collect' };
  unit.path = routeField(state, unit, patch) ?? [];
}

/** Start a reproducible battle; the campaign supplies the deployed forces. */
export function createBattlefield({
  attackers = 9,
  defenders = 8,
  sector = 'Ember',
} = {}) {
  if (
    ![attackers, defenders].every(
      (n) => Number.isInteger(n) && n >= 0 && n < FIELD.limit,
    ) ||
    attackers === 0
  )
    throw new TypeError('Invalid deployment');
  const state = {
    version: 1,
    sector,
    tick: 0,
    status: 'playing',
    winner: null,
    nextId: 1,
    credits: { player: 300, enemy: 300 },
    units: [],
    buildings: [],
    shots: [],
    rocks: [],
    roads: [],
    rough: [],
    resources: [],
  };
  for (let y = 0; y < FIELD.height; y++)
    for (let x = 0; x < FIELD.width; x++) {
      if (
        y === 10 ||
        x === 15 ||
        ((y === 6 || y === 15) && x >= 8 && x <= 23) ||
        ((x === 8 || x === 23) && y >= 6 && y <= 15)
      )
        state.roads.push({ x, y });
      else if (
        (x >= 10 && x <= 13 && y >= 6 && y <= 9) ||
        (x >= 18 && x <= 21 && y >= 12 && y <= 15)
      )
        state.rough.push({ x, y });
    }
  for (const [x, y] of [
    [14, 3],
    [15, 3],
    [16, 3],
    [14, 4],
    [16, 4],
    [15, 17],
    [16, 17],
    [17, 17],
    [17, 18],
    [12, 15],
    [20, 6],
  ])
    state.rocks.push({ x, y });
  for (const [x, y] of [
    [8, 5],
    [9, 5],
    [8, 6],
    [9, 6],
    [22, 15],
    [23, 15],
    [22, 16],
    [23, 16],
    [15, 10],
    [16, 10],
    [15, 11],
    [16, 11],
  ])
    state.resources.push({ id: state.nextId++, x, y, amount: 500 });
  for (const [owner, x, y] of [
    ['player', 2, 10],
    ['enemy', 27, 9],
  ]) {
    addBuilding(state, owner, 'hq', x, y);
    addBuilding(
      state,
      owner,
      'power',
      owner === 'player' ? 2 : 28,
      owner === 'player' ? 6 : 14,
    );
    const refinery = addBuilding(
      state,
      owner,
      'refinery',
      owner === 'player' ? 6 : 24,
      owner === 'player' ? 10 : 9,
    );
    if (owner === 'enemy') addBuilding(state, owner, 'barracks', 26, 5);
    const spots = freeNear(state, {
      x: owner === 'player' ? 7 : 24,
      y: owner === 'player' ? 13 : 7,
    });
    const count = owner === 'player' ? attackers : defenders;
    for (let i = 0; i < count; i++)
      addTroop(state, owner, 'infantry', spots[i]);
    const worker = addTroop(
      state,
      owner,
      'harvester',
      spawnSpot(state, centre(refinery)),
    );
    beginGather(
      state,
      worker,
      state.resources.filter((p) =>
        owner === 'player' ? p.x < 12 : p.x > 20,
      )[0],
    );
  }
  return state;
}

/** Current generation and consumption for one base. */
export function fieldPower(state, owner) {
  const buildings = state.buildings.filter(
    (b) => b.owner === owner && b.hp > 0,
  );
  return {
    supply: buildings.reduce((sum, b) => sum + BUILDINGS[b.kind].power, 0),
    demand: buildings.reduce((sum, b) => sum + BUILDINGS[b.kind].drain, 0),
  };
}
/** Validate placement without mutating the battlefield. */
export function fieldPlacement(state, owner, kind, x, y) {
  const spec = BUILDINGS[kind];
  if (!spec || kind === 'hq' || !inside(x, y, spec.size))
    return 'invalid-placement';
  if (state.credits[owner] < spec.cost) return 'funds';
  for (let b = y; b < y + spec.size; b++)
    for (let a = x; a < x + spec.size; a++) {
      if (
        occupied(state, a, b) ||
        state.resources.some((p) => p.amount > 0 && p.x === a && p.y === b) ||
        state.units.some(
          (u) => u.hp > 0 && Math.round(u.x) === a && Math.round(u.y) === b,
        )
      )
        return 'occupied';
    }
  const anchors = state.buildings.filter(
    (b) => b.owner === owner && b.hp > 0 && b.kind !== 'turret',
  );
  if (!anchors.some((b) => distance(centre(b), { x, y }) <= 7))
    return 'build-range';
  // Reject construction that would seal off any existing unit's tile.
  const candidate = structuredClone(state);
  addBuilding(candidate, owner, kind, x, y);
  for (const u of state.units.filter((u) => u.hp > 0)) {
    const a = Math.round(u.x),
      b = Math.round(u.y);
    if (!neighbours(a, b).some(([c, d]) => !occupied(candidate, c, d)))
      return 'blocked';
  }
  return null;
}
function pathToTarget(state, unit, target) {
  const destinations = freeNear(state, centre(target)).filter(
    (p) =>
      !state.units.some(
        (u) =>
          u.id !== unit.id &&
          ((Math.round(u.x) === p.x && Math.round(u.y) === p.y) ||
            (u.path.at(-1)?.x === p.x && u.path.at(-1)?.y === p.y)),
      ),
  );
  for (const goal of destinations.slice(0, 40)) {
    const path = routeField(state, unit, goal);
    if (path !== null) return path;
  }
  return [];
}
function issue(state, command, owner) {
  if (!['player', 'enemy'].includes(owner)) return 'invalid';
  if (command.type === 'build') {
    const error = fieldPlacement(
      state,
      owner,
      command.kind,
      command.x,
      command.y,
    );
    if (error) return error;
    state.credits[owner] -= BUILDINGS[command.kind].cost;
    addBuilding(state, owner, command.kind, command.x, command.y);
    // Building footprints may invalidate previously issued routes.
    for (const u of state.units)
      if (u.path.some((p) => occupied(state, p.x, p.y))) u.path = [];
    return null;
  }
  if (command.type === 'train') {
    const spec = TROOPS[command.kind];
    const producer = state.buildings.find(
      (b) => b.id === command.building && b.owner === owner && b.hp > 0,
    );
    if (!spec || !producer || producer.kind !== spec.producer)
      return 'producer';
    if (producer.queue) return 'queue';
    if (
      state.units.filter((u) => u.owner === owner && u.hp > 0).length +
        state.buildings.filter((b) => b.owner === owner && b.queue).length >=
      FIELD.limit
    )
      return 'unit-limit';
    if (state.credits[owner] < spec.cost) return 'funds';
    state.credits[owner] -= spec.cost;
    producer.queue = { kind: command.kind, remaining: spec.time };
    return null;
  }
  if (!Array.isArray(command.units)) return 'selection';
  const ids = new Set(command.units);
  const selected = state.units.filter(
    (u) => ids.has(u.id) && u.owner === owner && u.hp > 0,
  );
  if (!selected.length) return 'selection';
  if (command.type === 'stop') {
    for (const u of selected) {
      u.path = [];
      u.order = null;
    }
    return null;
  }
  if (command.type === 'gather') {
    const patch = state.resources.find(
      (p) => p.id === command.patch && p.amount > 0,
    );
    if (!patch || selected.some((u) => u.kind !== 'harvester'))
      return 'harvester';
    for (const unit of selected) {
      if (routeField(state, unit, patch) === null) return 'unreachable';
      beginGather(state, unit, patch);
    }
    return null;
  }
  if (command.type === 'attack') {
    const target = [...state.units, ...state.buildings].find(
      (u) => u.id === command.target && u.hp > 0 && u.owner !== owner,
    );
    if (!target || selected.some((u) => u.kind === 'harvester'))
      return 'target';
    for (const u of selected) {
      u.order = { type: 'attack', target: target.id };
      u.path = pathToTarget(state, u, target);
    }
    return null;
  }
  if (
    !['move', 'advance'].includes(command.type) ||
    !inside(command.x, command.y) ||
    occupied(state, command.x, command.y)
  )
    return 'invalid-move';
  const destinations = freeNear(state, command);
  let accepted = 0;
  for (const u of selected) {
    let path;
    let goal;
    for (let i = 0; i < destinations.length; i++) {
      goal = destinations[i];
      path = routeField(state, u, goal);
      if (path !== null) {
        destinations.splice(i, 1);
        break;
      }
    }
    if (path === null || path === undefined) continue;
    u.path = path;
    u.order = { type: command.type, x: goal.x, y: goal.y };
    accepted++;
  }
  return accepted ? null : 'unreachable';
}

/** Apply an atomic player/AI command, with identical rule validation for both. */
export function commandField(current, command, owner = 'player') {
  if (current.status !== 'playing')
    return { state: current, error: 'finished' };
  const state = structuredClone(current);
  const error = issue(state, command, owner);
  return error ? { state: current, error } : { state, error: null };
}
function walk(state, unit) {
  if (!unit.path.length) return;
  const target = unit.path[0];
  if (occupied(state, target.x, target.y)) {
    unit.path = [];
    return;
  }
  const d = distance(unit, target),
    step =
      (TROOPS[unit.kind].speed * FIELD.step) /
      fieldTravelCost(state, target.x, target.y);
  if (d <= step) {
    unit.x = target.x;
    unit.y = target.y;
    unit.path.shift();
  } else {
    unit.x += ((target.x - unit.x) / d) * step;
    unit.y += ((target.y - unit.y) / d) * step;
  }
}
function gather(state, unit) {
  let order = unit.order;
  if (order?.type !== 'gather') return;
  let patch = state.resources.find((p) => p.id === order.patch);
  if (order.phase === 'collect' && (!patch || patch.amount === 0)) {
    patch = state.resources
      .filter((p) => p.amount > 0)
      .sort((a, b) => distance(unit, a) - distance(unit, b) || a.id - b.id)[0];
    if (patch) {
      order.patch = patch.id;
      unit.path = [];
    } else {
      order.phase = 'return';
      unit.path = [];
    }
  }
  if (order.phase === 'collect' && distance(unit, patch) < 0.6) {
    const amount = Math.min(2, patch.amount, 50 - unit.cargo);
    patch.amount -= amount;
    unit.cargo += amount;
    if (unit.cargo >= 50 || patch.amount <= 0) {
      order.phase = 'return';
      unit.path = [];
    }
  }
  if (order.phase === 'return') {
    const refineries = state.buildings
      .filter(
        (b) => b.owner === unit.owner && b.kind === 'refinery' && b.hp > 0,
      )
      .sort(
        (a, b) =>
          distance(unit, centre(a)) - distance(unit, centre(b)) || a.id - b.id,
      );
    const base = refineries[0];
    if (!base) {
      unit.path = [];
      return;
    }
    if (distance(unit, centre(base)) <= 2.3) {
      state.credits[unit.owner] += unit.cargo;
      unit.cargo = 0;
      const nextPatch = state.resources
        .filter((p) => p.amount > 0)
        .sort(
          (a, b) => distance(unit, a) - distance(unit, b) || a.id - b.id,
        )[0];
      if (nextPatch) beginGather(state, unit, nextPatch);
      else {
        unit.order = null;
        unit.path = [];
      }
    } else if (!unit.path.length) unit.path = pathToTarget(state, unit, base);
  } else if (!unit.path.length && patch && distance(unit, patch) >= 0.6)
    unit.path = routeField(state, unit, patch) ?? [];
}
function aiStep(state) {
  const base = state.buildings.find(
    (b) => b.owner === 'enemy' && b.kind === 'hq',
  );
  const power = fieldPower(state, 'enemy');
  const desired =
    power.supply < power.demand + 5
      ? 'power'
      : !state.buildings.some(
            (b) => b.owner === 'enemy' && b.kind === 'factory',
          )
        ? 'factory'
        : !state.buildings.some(
              (b) => b.owner === 'enemy' && b.kind === 'turret',
            )
          ? 'turret'
          : null;
  if (desired && state.tick % 25 === 0) {
    for (const spot of freeNear(state, centre(base)))
      if (!fieldPlacement(state, 'enemy', desired, spot.x, spot.y)) {
        issue(state, { type: 'build', kind: desired, ...spot }, 'enemy');
        break;
      }
  }
  if (state.tick % 10 === 0)
    for (const building of state.buildings.filter(
      (b) => b.owner === 'enemy' && !b.queue,
    )) {
      const kind =
        building.kind === 'barracks'
          ? 'infantry'
          : building.kind === 'factory'
            ? 'tank'
            : building.kind === 'refinery' &&
                !state.units.some(
                  (u) => u.owner === 'enemy' && u.kind === 'harvester',
                )
              ? 'harvester'
              : null;
      if (kind)
        issue(state, { type: 'train', kind, building: building.id }, 'enemy');
    }
  if (state.tick >= 150 && state.tick % 75 === 0) {
    const target = state.buildings.find(
      (b) => b.owner === 'player' && b.kind === 'hq',
    );
    const units = state.units
      .filter((u) => u.owner === 'enemy' && u.kind !== 'harvester')
      .map((u) => u.id);
    if (target && units.length >= 3)
      issue(state, { type: 'attack', units, target: target.id }, 'enemy');
  }
}

/** Advance a fixed 200ms step. Damage is simultaneous; IDs break targeting ties. */
export function tickField(current, { ai = true } = {}) {
  if (current.status !== 'playing') return current;
  const state = structuredClone(current);
  state.tick++;
  state.shots = state.shots.filter((s) => --s.ttl > 0);
  if (ai) aiStep(state);
  for (const building of state.buildings) {
    if (!building.queue) continue;
    const power = fieldPower(state, building.owner);
    if (power.demand > power.supply) continue;
    if (--building.queue.remaining <= 0) {
      const spot = spawnSpot(state, {
        x: building.x,
        y: building.y + BUILDINGS[building.kind].size,
      });
      if (!spot) {
        building.queue.remaining = 1;
        continue;
      }
      const u = addTroop(state, building.owner, building.queue.kind, spot);
      building.queue = null;
      if (u.kind === 'harvester') {
        const patch = state.resources
          .filter((p) => p.amount > 0)
          .sort((a, b) => distance(u, a) - distance(u, b) || a.id - b.id)[0];
        if (patch) beginGather(state, u, patch);
      }
    }
  }
  const damage = new Map();
  const entities = [...state.units, ...state.buildings];
  for (const unit of entities) {
    unit.cooldown = Math.max(0, unit.cooldown - 1);
    const mobile = Boolean(TROOPS[unit.kind]);
    const spec = TROOPS[unit.kind] ?? BUILDINGS[unit.kind];
    if (unit.kind === 'harvester') {
      gather(state, unit);
      walk(state, unit);
      continue;
    }
    if (!spec.damage) continue;
    if (!mobile) {
      const power = fieldPower(state, unit.owner);
      if (power.demand > power.supply) continue;
    }
    const enemies = entities
      .filter((other) => other.owner !== unit.owner && other.hp > 0)
      .sort(
        (a, b) =>
          distance(unit, centre(a)) - distance(unit, centre(b)) || a.id - b.id,
      );
    let target =
      unit.order?.type === 'attack'
        ? enemies.find((u) => u.id === unit.order.target)
        : null;
    if (mobile && unit.order?.type === 'attack' && !target) {
      unit.order = null;
      unit.path = [];
    }
    if (unit.order?.type !== 'move') {
      const inRange = enemies.find(
        (u) => distance(centre(unit), centre(u)) <= spec.range,
      );
      if (!target || distance(centre(unit), centre(target)) > spec.range)
        target = inRange ?? target;
      if (!target && unit.order?.type === 'advance')
        target = enemies.find((u) => distance(unit, centre(u)) < 7);
    }
    if (target && distance(centre(unit), centre(target)) <= spec.range) {
      if (!unit.cooldown) {
        damage.set(target.id, (damage.get(target.id) ?? 0) + spec.damage);
        unit.cooldown = spec.reload;
        state.shots.push({
          from: centre(unit),
          to: centre(target),
          owner: unit.owner,
          ttl: 2,
        });
      }
      continue;
    }
    if (mobile) {
      if (target && (state.tick % 5 === 0 || !unit.path.length))
        unit.path = pathToTarget(state, unit, target);
      else if (
        !unit.path.length &&
        ['move', 'advance'].includes(unit.order?.type)
      )
        unit.path = routeField(state, unit, unit.order) ?? [];
      walk(state, unit);
      if (!unit.path.length && unit.order?.type === 'move') unit.order = null;
    }
  }
  for (const entity of entities)
    entity.hp = Math.max(0, entity.hp - (damage.get(entity.id) ?? 0));
  state.units = state.units.filter((u) => u.hp > 0);
  state.buildings = state.buildings.filter((b) => b.hp > 0);
  const player = state.buildings.some(
    (b) => b.owner === 'player' && b.kind === 'hq',
  );
  const enemy = state.buildings.some(
    (b) => b.owner === 'enemy' && b.kind === 'hq',
  );
  if (!player || !enemy) {
    state.status = 'finished';
    state.winner = player ? 'player' : enemy ? 'enemy' : 'draw';
  }
  return state;
}

/** Combat survivors are the campaign garrison; harvesters stay in the theatre. */
export function fieldSurvivors(state, owner) {
  return state.units.filter(
    (u) => u.owner === owner && u.kind !== 'harvester' && u.hp > 0,
  ).length;
}
