import { commandMatch, resolveCampaignBattle } from './simulation.js';
import { createBattlefield, fieldSurvivors } from './battlefield.js';

/** Deploy troops and reserve each side's tactical budget from campaign credits. */
export function deploySectorBattle(current, from, target) {
  const result = commandMatch(current, {
    type: 'battle',
    sector: from,
    target,
    units: Math.min(24, (current.sectors[from]?.units ?? 0) - 1),
  });
  if (result.error) return result;
  const battlefield = createBattlefield({
    attackers: result.state.battle.units,
    defenders: current.sectors[target].units,
    sector: current.sectors[target].name,
  });
  const stock = current.sectors[target].oreStock;
  if (Array.isArray(stock) && stock.length === battlefield.resources.length)
    battlefield.resources.forEach((patch, i) => {
      patch.amount = stock[i];
    });
  battlefield.campaignBattleId = result.state.battle.id;
  for (const owner of ['player', 'enemy']) {
    const budget = Math.min(300, result.state.factions[owner].credits);
    result.state.factions[owner].credits -= budget;
    battlefield.credits[owner] = budget;
  }
  return { ...result, battlefield };
}

/** Settle once, refund unspent/harvested credits and preserve surviving troops. */
export function settleSectorBattle(
  current,
  battlefield,
  { retreat = false } = {},
) {
  if (
    !current.battle ||
    battlefield?.campaignBattleId !== current.battle.id ||
    (!retreat && battlefield.status !== 'finished') ||
    !['player', 'enemy'].every(
      (owner) =>
        Number.isSafeInteger(battlefield.credits[owner]) &&
        battlefield.credits[owner] >= 0 &&
        battlefield.credits[owner] <= 1_000_000,
    )
  )
    return { state: current, error: 'unfinished-battle' };
  const survivors = fieldSurvivors(battlefield, 'player');
  const result = resolveCampaignBattle(current, current.battle.id, {
    winner: retreat
      ? 'retreat'
      : battlefield.winner === 'player' && survivors === 0
        ? 'draw'
        : battlefield.winner,
    survivors,
    defenders: fieldSurvivors(battlefield, 'enemy'),
  });
  if (!result.error)
    result.state.sectors[current.battle.target].oreStock =
      battlefield.resources.map((patch) => patch.amount);
  if (!result.error)
    for (const owner of ['player', 'enemy'])
      result.state.factions[owner].credits += battlefield.credits[owner];
  return result;
}
