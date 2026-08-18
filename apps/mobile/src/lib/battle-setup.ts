import {
  createRng,
  initialBattleState,
  resolveBattleSetup,
  type BattleConfig,
  type BattleState,
  type SoloBattleCfg,
} from "@ptb/core";
import type { Trivia } from "@ptb/core/trivia";

/** A placeholder matchup until partner selection exists (ROADMAP Phase 3).
 *  Bulbasaur (grass) vs Charmander (fire) is the same fixture the ported
 *  engine tests use, so a battle here and a passing test exercise the same
 *  type matchup — the player is at a disadvantage, which is the interesting
 *  case rather than the flattering one. */
export const DEMO_MATCHUP = {
  playerPokemonId: 1,
  playerTypes: ["grass"] as const,
  enemyPokemonId: 4,
  enemyTypes: ["fire"] as const,
  level: 5,
};

export function buildCfg(questions: Trivia[]): SoloBattleCfg {
  return {
    questions,
    playerPokemonId: DEMO_MATCHUP.playerPokemonId,
    playerTypes: [...DEMO_MATCHUP.playerTypes],
    abilityId: null,
    level: DEMO_MATCHUP.level,
    mode: "battle",
    enemyPokemonId: DEMO_MATCHUP.enemyPokemonId,
    enemyTypes: [...DEMO_MATCHUP.enemyTypes],
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
export function startBattle(cfg: SoloBattleCfg, seed = String(Math.random()).slice(2)): BattleRuntime {
  const setup = resolveBattleSetup(cfg);
  const state = initialBattleState(
    setup.config.playerMaxHp,
    setup.startingEnemyHp,
    setup.startingItemsUsedCount,
  );
  return { config: setup.config, state, rng: createRng(seed), seed };
}
