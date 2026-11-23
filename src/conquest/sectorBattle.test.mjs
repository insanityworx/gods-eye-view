import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, tickMatch, commandMatch } from './simulation.js';
import { deploySectorBattle, settleSectorBattle } from './sectorBattle.js';

test('tactical deployment reserves troops and freezes campaign commands and time', () => {
  const initial = createMatch();
  const result = deploySectorBattle(initial, 0, 1);
  assert.equal(result.error, null);
  assert.equal(result.state.sectors[0].units, 1);
  assert.equal(initial.sectors[0].units, 10);
  assert.strictEqual(tickMatch(result.state), result.state);
  assert.equal(
    commandMatch(result.state, { type: 'train', sector: 0 }).error,
    'battle-active',
  );
  assert.equal(deploySectorBattle(initial, 0, 8).error, 'invalid-battle');
  assert.equal(
    settleSectorBattle(result.state, result.battlefield).error,
    'unfinished-battle',
  );
});
test('winning a tactical battle captures the selected sector exactly once', () => {
  const result = deploySectorBattle(createMatch(), 0, 1);
  const battlefield = result.battlefield;
  battlefield.status = 'finished';
  battlefield.winner = 'player';
  battlefield.units = battlefield.units.filter((u) => u.owner === 'player');
  const settled = settleSectorBattle(result.state, battlefield);
  assert.equal(settled.error, null);
  assert.equal(settled.state.sectors[1].owner, 'player');
  assert.equal(settled.state.sectors[1].units, 9);
  assert.equal(settled.state.battle, null);
  assert.equal(
    settleSectorBattle(settled.state, battlefield).error,
    'unfinished-battle',
  );
});
test('retreat returns surviving combat troops and preserves the defender garrison', () => {
  const result = deploySectorBattle(createMatch(), 0, 1);
  result.battlefield.units = result.battlefield.units.filter(
    (u) =>
      u.kind === 'harvester' ||
      u.owner === 'enemy' ||
      u.id === result.battlefield.units.find((u) => u.owner === 'player').id,
  );
  const settled = settleSectorBattle(result.state, result.battlefield, {
    retreat: true,
  });
  assert.equal(settled.state.sectors[0].units, 2);
  assert.equal(settled.state.sectors[1].owner, 'neutral');
  assert.equal(settled.state.sectors[1].units, 2);
  assert.equal(settled.state.battle, null);
});

test('tactical budgets reserve and return actual campaign credits without minting a new allowance', () => {
  const initial = createMatch();
  const result = deploySectorBattle(initial, 0, 1);
  assert.equal(result.state.factions.player.credits, 0);
  assert.equal(result.battlefield.credits.player, 240);
  assert.equal(result.state.factions.enemy.credits, 0);
  assert.equal(result.battlefield.credits.enemy, 180);
  result.battlefield.credits.player -= 90;
  const settled = settleSectorBattle(result.state, result.battlefield, {
    retreat: true,
  });
  assert.equal(settled.state.factions.player.credits, 150);
  assert.equal(settled.state.factions.enemy.credits, 180);
  const wrong = { ...result.battlefield, campaignBattleId: 999 };
  assert.equal(
    settleSectorBattle(result.state, wrong, { retreat: true }).error,
    'unfinished-battle',
  );
});

test('ore depletion persists between assaults so retreat cannot regenerate a sector deposit', () => {
  const result = deploySectorBattle(createMatch(), 0, 1);
  result.battlefield.resources[0].amount = 0;
  const settled = settleSectorBattle(result.state, result.battlefield, {
    retreat: true,
  });
  const again = deploySectorBattle(settled.state, 0, 1);
  assert.equal(again.battlefield.resources[0].amount, 0);
  assert.equal(again.battlefield.resources[1].amount, 500);
});
