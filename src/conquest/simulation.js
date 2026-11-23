/** Deterministic, fictional campaign rules. One tick is one game second. */
export const SECTORS = [
  ['Aster', -12, 59],
  ['Boreal', 0, 59],
  ['Cinder', 12, 59],
  ['Delta', -12, 51],
  ['Ember', 0, 51],
  ['Flint', 12, 51],
  ['Gale', -12, 43],
  ['Haven', 0, 43],
  ['Ion', 12, 43],
].map(([name, lon, lat], id) => ({ id, name, lon, lat }));
export const COSTS = Object.freeze({
  train: 40,
  factory: 120,
  refinery: 100,
  shield: 80,
  relief: 60,
  strategic: 250,
});

/** Four-way campaign adjacency, independent of real borders. */
export function adjacent(a, b) {
  return (
    Math.abs((a % 3) - (b % 3)) +
      Math.abs(Math.floor(a / 3) - Math.floor(b / 3)) ===
    1
  );
}

/** Start a campaign with a copied, immutable weather input and fictional exposure. */
export function createMatch({
  mode = 'conquest',
  snapshot = { source: 'synthetic', windKph: 15, observedAt: null },
} = {}) {
  if (!['conquest', 'total-war'].includes(mode))
    throw new TypeError('Unknown mode');
  return {
    version: 2,
    battle: null,
    mode,
    tick: 0,
    status: 'playing',
    winner: null,
    escalation: mode === 'total-war' ? 75 : 0,
    snapshot: structuredClone(snapshot),
    factions: {
      player: { credits: 240, reputation: 100, cooldown: 0 },
      enemy: { credits: 180, reputation: 100, cooldown: 0 },
    },
    sectors: SECTORS.map((sector) => ({
      ...sector,
      owner: sector.id === 0 ? 'player' : sector.id === 8 ? 'enemy' : 'neutral',
      units: [10, 2, 3, 2, 5, 3, 3, 3, 10][sector.id],
      infrastructure: 100,
      strain: 0,
      exposure: [1, 2, 1, 2, 3, 2, 1, 2, 1][sector.id],
      factory: sector.id === 0 || sector.id === 8 ? 1 : 0,
      refinery: 1,
      shield: 0,
    })),
    orders: [],
    events: [{ type: 'start', tick: 0 }],
    nextOrder: 1,
  };
}

function event(state, type, sector = null) {
  state.events.unshift({ type, sector, tick: state.tick });
  state.events.length = Math.min(state.events.length, 8);
}
function finish(state) {
  if (state.sectors[8].owner === 'player') {
    state.status = 'finished';
    state.winner = 'player';
  } else if (state.sectors[0].owner === 'enemy') {
    state.status = 'finished';
    state.winner = 'enemy';
  }
}
function strain(state, sector, amount) {
  // A game difficulty modifier for emergency response, never a fallout model.
  const responsePenalty = state.snapshot.windKph >= 30 ? 1.25 : 1;
  sector.strain = Math.min(
    100,
    sector.strain + Math.round(amount * sector.exposure * responsePenalty),
  );
}
function execute(state, command, actor) {
  const faction = state.factions[actor];
  const sector = state.sectors[command.sector];
  if (!faction || !sector) return 'invalid';
  if (command.type === 'strategic') {
    if (
      sector.owner === actor ||
      state.escalation < 70 ||
      faction.cooldown > 0 ||
      faction.credits < COSTS.strategic
    )
      return 'unavailable';
    faction.credits -= COSTS.strategic;
    faction.reputation = Math.max(10, faction.reputation - 30);
    faction.cooldown = 60;
    sector.units = Math.floor(sector.units * (sector.shield ? 0.6 : 0.2));
    sector.infrastructure = Math.max(10, sector.infrastructure - 65);
    strain(state, sector, 30);
    state.escalation = 100;
    event(state, 'strategic', sector.name);
    return null;
  }
  if (sector.owner !== actor) return 'ownership';
  if (command.type === 'battle') {
    const target = state.sectors[command.target];
    if (
      !target ||
      target.owner === actor ||
      !adjacent(sector.id, target.id) ||
      !Number.isInteger(command.units) ||
      command.units < 1 ||
      command.units > 24 ||
      command.units >= sector.units ||
      target.units > 36
    )
      return 'invalid-battle';
    sector.units -= command.units;
    state.battle = {
      id: state.nextOrder++,
      actor,
      from: sector.id,
      target: target.id,
      units: command.units,
    };
    return null;
  }
  if (command.type === 'move') {
    const target = state.sectors[command.target];
    const units = command.units;
    if (
      !target ||
      !adjacent(sector.id, target.id) ||
      !Number.isInteger(units) ||
      units < 1 ||
      units >= sector.units
    )
      return 'invalid-move';
    sector.units -= units;
    state.orders.push({
      id: state.nextOrder++,
      type: 'move',
      actor,
      from: sector.id,
      target: target.id,
      units,
      remaining: 6,
    });
    event(state, 'dispatch', target.name);
    return null;
  }
  const cost = COSTS[command.type];
  if (cost === undefined || faction.credits < cost) return 'funds';
  if (command.type === 'train') {
    if (
      !sector.factory ||
      state.orders.some(
        (order) => order.type === 'train' && order.target === sector.id,
      )
    )
      return 'production';
    state.orders.push({
      id: state.nextOrder++,
      type: 'train',
      actor,
      target: sector.id,
      units: 4,
      remaining: 10 - sector.factory * 2,
    });
  } else if (command.type === 'relief') {
    if (sector.infrastructure === 100 && sector.strain === 0)
      return 'unavailable';
    sector.infrastructure = Math.min(100, sector.infrastructure + 25);
    sector.strain = Math.max(0, sector.strain - 30);
    faction.reputation = Math.min(100, faction.reputation + 5);
  } else if (['factory', 'refinery', 'shield'].includes(command.type)) {
    if (sector[command.type] >= 3) return 'maximum';
    sector[command.type]++;
  } else return 'invalid';
  faction.credits -= cost;
  return null;
}

/** Validate an order and return a new state; rejected orders never change input. */
export function commandMatch(current, command, actor = 'player') {
  if (current.status !== 'playing')
    return { state: current, error: 'finished' };
  if (current.battle) return { state: current, error: 'battle-active' };
  const state = structuredClone(current);
  const error = execute(state, command, actor);
  if (error) return { state: current, error };
  return { state, error: null };
}
function resolveOrder(state, order) {
  const target = state.sectors[order.target];
  if (order.type === 'train') {
    if (target.owner === order.actor) target.units += order.units;
    return;
  }
  if (target.owner === order.actor) {
    target.units += order.units;
    return;
  }
  const defense = target.units + target.shield * 3;
  if (order.units > defense) {
    target.owner = order.actor;
    target.units = order.units - defense;
    event(state, 'capture', target.name);
  } else {
    target.units = Math.max(0, target.units - Math.ceil(order.units * 0.75));
    event(state, 'repelled', target.name);
  }
  target.infrastructure = Math.max(10, target.infrastructure - 8);
  strain(state, target, 3);
  state.escalation = Math.min(100, state.escalation + 7);
  finish(state);
}
function enemyTurn(state) {
  const owned = state.sectors.filter((sector) => sector.owner === 'enemy');
  for (const sector of owned) {
    if (sector.factory)
      execute(state, { type: 'train', sector: sector.id }, 'enemy');
    const target = state.sectors
      .filter(
        (other) => other.owner !== 'enemy' && adjacent(sector.id, other.id),
      )
      .sort((a, b) => a.units - b.units || a.id - b.id)[0];
    if (target && sector.units > target.units + target.shield * 3 + 3)
      execute(
        state,
        {
          type: 'move',
          sector: sector.id,
          target: target.id,
          units: sector.units - 1,
        },
        'enemy',
      );
    else if (!sector.factory && state.factions.enemy.credits >= 120)
      execute(state, { type: 'factory', sector: sector.id }, 'enemy');
    else if (!target && sector.units > 6) {
      const frontier = owned
        .filter((other) => adjacent(sector.id, other.id))
        .sort((a, b) => a.units - b.units)[0];
      if (frontier && frontier.units < sector.units)
        execute(
          state,
          {
            type: 'move',
            sector: sector.id,
            target: frontier.id,
            units: Math.floor(sector.units / 2),
          },
          'enemy',
        );
    }
  }
  if (state.mode === 'total-war' || state.escalation === 100) {
    const target = state.sectors
      .filter((sector) => sector.owner === 'player')
      .sort((a, b) => b.units - a.units || a.id - b.id)[0];
    if (target)
      execute(state, { type: 'strategic', sector: target.id }, 'enemy');
  }
}

/** Advance one fixed step, resolving queued orders in deterministic ID order. */
export function tickMatch(current, { ai = true } = {}) {
  if (current.status !== 'playing' || current.battle) return current;
  const state = structuredClone(current);
  state.tick++;
  for (const faction of Object.values(state.factions))
    faction.cooldown = Math.max(0, faction.cooldown - 1);
  if (state.tick % 4 === 0)
    for (const sector of state.sectors) {
      if (sector.owner !== 'neutral')
        state.factions[sector.owner].credits += Math.max(
          1,
          Math.round(
            (((8 * sector.refinery * sector.infrastructure) / 100) *
              state.factions[sector.owner].reputation) /
              100,
          ),
        );
    }
  const pending = [];
  for (const order of state.orders) {
    order.remaining--;
    if (order.remaining <= 0) {
      resolveOrder(state, order);
      if (state.status === 'finished') break;
    } else pending.push(order);
  }
  state.orders = state.status === 'finished' ? [] : pending;
  if (ai && state.status === 'playing' && state.tick % 8 === 0)
    enemyTurn(state);
  return state;
}

/** Resolve the local tactical theatre once, carrying surviving forces to the campaign. */
export function resolveCampaignBattle(
  current,
  battleId,
  { winner, survivors, defenders },
) {
  if (
    !current.battle ||
    current.battle.id !== battleId ||
    !['player', 'enemy', 'draw', 'retreat'].includes(winner) ||
    ![survivors, defenders].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 64,
    ) ||
    (winner === 'player' && survivors === 0)
  )
    return { state: current, error: 'invalid-result' };
  const state = structuredClone(current);
  const battle = state.battle;
  const target = state.sectors[battle.target];
  if (winner === 'player') {
    target.owner = 'player';
    target.units = survivors;
    event(state, 'capture', target.name);
  } else {
    target.units = defenders;
    state.sectors[battle.from].units += survivors;
    event(state, 'repelled', target.name);
  }
  target.infrastructure = Math.max(10, target.infrastructure - 8);
  strain(state, target, 3);
  state.escalation = Math.min(100, state.escalation + 7);
  state.battle = null;
  finish(state);
  return { state, error: null };
}
