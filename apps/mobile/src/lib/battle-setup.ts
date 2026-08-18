import {
  createRng,
  initialBattleState,
  resolveBattleSetup,
  type BattleConfig,
  type BattleState,
  type SoloBattleCfg,
} from "@ptb/core";
import type { PokeEntry } from "@ptb/core/pokemon-data";
import type { Trivia } from "@ptb/core/trivia";
import { STARTERS } from "./partners";

/** Used only when no partner has been chosen yet — Bulbasaur, the same fixture
 *  the ported engine tests use. */
export const DEFAULT_PARTNER_ID = 1;

export function pickOpponent(partner: PokeEntry): PokeEntry {
  const others = STARTERS.filter((p) => p.id !== partner.id);
  return others[Math.floor(Math.random() * others.length)] ?? partner;
}

export function buildCfg(
  questions: Trivia[],
  partner: PokeEntry,
  opponent: PokeEntry,
  level = 5,
  mode: SoloBattleCfg["mode"] = "battle",
): SoloBattleCfg {
  return {
    questions,
    playerPokemonId: partner.id,
    playerTypes: [...partner.types],
    abilityId: null,
    level,
    mode,
    enemyPokemonId: opponent.id,
    enemyTypes: [...opponent.types],
    trainingPoints: 0,
    items: {
      assaultVestActive: false,
      kingsRockActive: false,
      leftoversActive: false,
      metronomeActive: false,
      silkScarfAvailable: false,
      focusBandAvailable: false,
      reviveAvailable: false,
      oranBerryAvailable: false,
    },
  };
}

export interface BattleRuntime {
  config: BattleConfig;
  state: BattleState;
  rng: ReturnType<typeof createRng>;
  seed: string;
}

/** The seed is generated once per battle and would be sent to the server with
 *  the action log, which is what makes the whole battle replayable and
 *  therefore checkable. Ambient randomness is fine HERE — this is app code,
 *  not engine code; `packages/core` may never call Math.random. */
export function startBattle(
  cfg: SoloBattleCfg,
  seed = String(Math.random()).slice(2),
): BattleRuntime {
  const setup = resolveBattleSetup(cfg);
  const state = initialBattleState(
    setup.config.playerMaxHp,
    setup.startingEnemyHp,
    setup.startingItemsUsedCount,
  );
  return { config: setup.config, state, rng: createRng(seed), seed };
}
