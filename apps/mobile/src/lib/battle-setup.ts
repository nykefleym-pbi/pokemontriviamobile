import {
  createRng,
  initialBattleState,
  resolveBattleSetup,
  type BattleConfig,
  type BattleState,
  type SoloBattleCfg,
  type SoloBattleCfgRef,
  type SoloBattleSetupInput,
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

/** Everything about a battle EXCEPT which questions it uses — the half both
 *  paths share. Split out because the two paths name their questions
 *  differently and for a reason: a server battle sends ids and lets the server
 *  resolve the answers, while an offline battle has to carry the bundled
 *  questions, answers and all, because there is no server in the loop to ask.
 */
export function buildSetup(
  partner: PokeEntry,
  opponent: PokeEntry,
  level = 5,
  mode: SoloBattleCfg["mode"] = "battle",
): SoloBattleSetupInput {
  return {
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

/** The OFFLINE cfg: bundled questions with their own answers, graded and
 *  replayed entirely on the device. */
export function buildCfg(
  questions: Trivia[],
  partner: PokeEntry,
  opponent: PokeEntry,
  level = 5,
  mode: SoloBattleCfg["mode"] = "battle",
): SoloBattleCfg {
  return { ...buildSetup(partner, opponent, level, mode), questions };
}

/** The ONLINE cfg: question ids only. The device could not fill in a
 *  `questions` array if it wanted to — `get_trivia_questions` withholds
 *  `correct_index`. */
export function buildCfgRef(
  questionIds: string[],
  partner: PokeEntry,
  opponent: PokeEntry,
  level = 5,
  mode: SoloBattleCfg["mode"] = "battle",
): SoloBattleCfgRef {
  return { ...buildSetup(partner, opponent, level, mode), questionIds };
}

export interface BattleRuntime {
  config: BattleConfig;
  state: BattleState;
  rng: ReturnType<typeof createRng>;
  seed: string;
}

/** Builds the local view of a battle: the derived config (HP maxima, matchup
 *  booleans) and the opening state.
 *
 *  Takes the setup half only, so it serves BOTH paths. For an online battle
 *  the returned `state` is just the opening frame to render — every state
 *  after that comes back from the server — and `rng`/`seed` go unused, since
 *  the server generates and owns the real seed.
 *
 *  Ambient randomness is fine HERE — this is app code, not engine code;
 *  `packages/core` may never call Math.random. */
export function startBattle(
  cfg: SoloBattleSetupInput,
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
