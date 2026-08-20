import { describe, expect, it } from "vitest";
import { isValidSoloBattleCfg, isValidSoloBattleCfgRef } from "./solo-battle-config";
import { isValidQuestionIdList, MAX_QUESTIONS_PER_BATTLE } from "./question-ids";
import { isValidBattleAction } from "./turn";
import { applyMegaAnswer, initialMegaRaidState, MEGA_MIN_QUESTIONS } from "./mega-replay";
import { megaReward } from "../lib/rewards";
import type { SoloBattleCfg, SoloBattleCfgRef } from "./solo-battle-config";

const VALID_ITEMS = {
  assaultVestActive: false,
  kingsRockActive: false,
  leftoversActive: false,
  metronomeActive: false,
  silkScarfAvailable: false,
  focusBandAvailable: false,
  reviveAvailable: false,
  oranBerryAvailable: false,
};

function validCfg(): SoloBattleCfg {
  return {
    questions: [{ question: "Q?", options: ["A", "B"], correct: 0, explanation: "e", category: "c" }],
    playerPokemonId: 1,
    playerTypes: ["grass"],
    abilityId: null,
    level: 5,
    mode: "battle",
    enemyPokemonId: 4,
    enemyTypes: ["fire"],
    trainingPoints: 0,
    items: VALID_ITEMS,
  };
}

function validRef(): SoloBattleCfgRef {
  const { questions: _questions, ...rest } = validCfg();
  return { ...rest, questionIds: ["11111111-1111-1111-1111-111111111111"] };
}

describe("isValidSoloBattleCfgRef", () => {
  it("accepts a well-formed ref", () => {
    expect(isValidSoloBattleCfgRef(validRef())).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isValidSoloBattleCfgRef(null)).toBe(false);
    expect(isValidSoloBattleCfgRef("cfg")).toBe(false);
  });

  it("rejects a hydrated cfg, which must never come off the wire", () => {
    expect(isValidSoloBattleCfgRef(validCfg())).toBe(false);
  });

  it("rejects an empty or non-array questionIds", () => {
    expect(isValidSoloBattleCfgRef({ ...validRef(), questionIds: [] })).toBe(false);
    expect(isValidSoloBattleCfgRef({ ...validRef(), questionIds: "abc" })).toBe(false);
  });

  it("rejects non-string and empty ids", () => {
    expect(isValidSoloBattleCfgRef({ ...validRef(), questionIds: [1, 2] })).toBe(false);
    expect(isValidSoloBattleCfgRef({ ...validRef(), questionIds: [""] })).toBe(false);
  });

  // Not a shape rule: every answer's reveal names the correct option, so a
  // repeated id would let a player miss a question once and then answer the
  // same question right for the rest of the battle.
  it("rejects duplicate question ids", () => {
    expect(isValidSoloBattleCfgRef({ ...validRef(), questionIds: ["a", "b", "a"] })).toBe(false);
    expect(isValidSoloBattleCfgRef({ ...validRef(), questionIds: ["a", "b", "c"] })).toBe(true);
  });

  it("caps how many questions one battle may name", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `q${i}`);
    expect(
      isValidSoloBattleCfgRef({ ...validRef(), questionIds: ids(MAX_QUESTIONS_PER_BATTLE) }),
    ).toBe(true);
    expect(
      isValidSoloBattleCfgRef({ ...validRef(), questionIds: ids(MAX_QUESTIONS_PER_BATTLE + 1) }),
    ).toBe(false);
  });

  it("still checks the half it shares with a hydrated cfg", () => {
    expect(isValidSoloBattleCfgRef({ ...validRef(), level: "5" })).toBe(false);
    expect(isValidSoloBattleCfgRef({ ...validRef(), mode: "raid" })).toBe(false);
    expect(isValidSoloBattleCfgRef({ ...validRef(), playerTypes: [] })).toBe(false);
    expect(isValidSoloBattleCfgRef({ ...validRef(), items: {} })).toBe(false);
  });
});

describe("isValidSoloBattleCfg", () => {
  it("accepts a well-formed cfg", () => {
    expect(isValidSoloBattleCfg(validCfg())).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isValidSoloBattleCfg(null)).toBe(false);
    expect(isValidSoloBattleCfg(undefined)).toBe(false);
    expect(isValidSoloBattleCfg("cfg")).toBe(false);
    expect(isValidSoloBattleCfg(42)).toBe(false);
  });

  it("rejects an empty questions array", () => {
    expect(isValidSoloBattleCfg({ ...validCfg(), questions: [] })).toBe(false);
  });

  it("rejects a malformed question", () => {
    expect(isValidSoloBattleCfg({ ...validCfg(), questions: [{ question: "Q?" }] })).toBe(false);
  });

  it("rejects an invalid mode", () => {
    expect(isValidSoloBattleCfg({ ...validCfg(), mode: "daily" })).toBe(false);
  });

  it("rejects an empty playerTypes array", () => {
    expect(isValidSoloBattleCfg({ ...validCfg(), playerTypes: [] })).toBe(false);
  });

  it("accepts a null abilityId but rejects a non-string one", () => {
    expect(isValidSoloBattleCfg({ ...validCfg(), abilityId: null })).toBe(true);
    expect(isValidSoloBattleCfg({ ...validCfg(), abilityId: 5 })).toBe(false);
  });

  it("rejects a missing items config", () => {
    const { items: _items, ...rest } = validCfg();
    expect(isValidSoloBattleCfg(rest)).toBe(false);
  });

  it("rejects an items config missing a required flag", () => {
    const { metronomeActive: _metronomeActive, ...restItems } = VALID_ITEMS;
    expect(isValidSoloBattleCfg({ ...validCfg(), items: restItems })).toBe(false);
  });

  it("rejects an items config with a non-boolean flag", () => {
    expect(
      isValidSoloBattleCfg({ ...validCfg(), items: { ...VALID_ITEMS, assaultVestActive: "yes" } }),
    ).toBe(false);
  });
});

describe("isValidBattleAction", () => {
  it("accepts a well-formed submit_answer", () => {
    expect(isValidBattleAction({ type: "submit_answer", questionIdx: 0, choiceIdx: 1, elapsedMs: 3000 })).toBe(
      true,
    );
  });

  it("accepts forfeit with no other fields", () => {
    expect(isValidBattleAction({ type: "forfeit" })).toBe(true);
  });

  it("accepts a well-formed use_item", () => {
    expect(isValidBattleAction({ type: "use_item", itemId: "potion" })).toBe(true);
  });

  it("rejects a use_item missing itemId", () => {
    expect(isValidBattleAction({ type: "use_item" })).toBe(false);
  });

  it("rejects a submit_answer missing a required field", () => {
    expect(isValidBattleAction({ type: "submit_answer", questionIdx: 0, choiceIdx: 1 })).toBe(false);
  });

  it("rejects an unknown action type", () => {
    expect(isValidBattleAction({ type: "cheat" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidBattleAction(null)).toBe(false);
    expect(isValidBattleAction("forfeit")).toBe(false);
  });
});

describe("isValidQuestionIdList", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `q${i}`);

  it("accepts a distinct, non-empty list", () => {
    expect(isValidQuestionIdList(["a", "b", "c"])).toBe(true);
  });

  it("rejects non-arrays, empties, and non-string or empty ids", () => {
    expect(isValidQuestionIdList("abc")).toBe(false);
    expect(isValidQuestionIdList(null)).toBe(false);
    expect(isValidQuestionIdList([])).toBe(false);
    expect(isValidQuestionIdList([1, 2])).toBe(false);
    expect(isValidQuestionIdList([""])).toBe(false);
  });

  // The cheating rule, stated once and tested once. See question-ids.ts.
  it("rejects duplicates", () => {
    expect(isValidQuestionIdList(["a", "b", "a"])).toBe(false);
  });

  it("caps the list", () => {
    expect(isValidQuestionIdList(ids(MAX_QUESTIONS_PER_BATTLE))).toBe(true);
    expect(isValidQuestionIdList(ids(MAX_QUESTIONS_PER_BATTLE + 1))).toBe(false);
  });

  it("honours a caller-supplied minimum, which is how Mega demands a winnable set", () => {
    expect(isValidQuestionIdList(ids(39), MEGA_MIN_QUESTIONS)).toBe(false);
    expect(isValidQuestionIdList(ids(40), MEGA_MIN_QUESTIONS)).toBe(true);
  });
});

describe("MEGA_MIN_QUESTIONS", () => {
  // Derived, so this pins the derivation rather than restating the number:
  // a set of exactly this length that is answered perfectly must WIN, and one
  // question shorter must LOSE on the ran-out-of-questions branch.
  it("is exactly the length a perfect run needs to win", () => {
    const play = (total: number) => {
      let s = initialMegaRaidState();
      for (let i = 0; i < total; i++) s = applyMegaAnswer(s, total, { correct: true });
      return s.phase;
    };
    expect(play(MEGA_MIN_QUESTIONS)).toBe("won");
    expect(play(MEGA_MIN_QUESTIONS - 1)).toBe("lost");
  });
});

describe("megaReward", () => {
  it("pays a flat purse for a clear", () => {
    expect(megaReward({ won: true, correctCount: 40 })).toEqual({ xp: 500, coins: 750, tp: 0 });
  });

  it("pays a losing run per correct answer, and nothing for none", () => {
    expect(megaReward({ won: false, correctCount: 12 })).toEqual({ xp: 60, coins: 0, tp: 0 });
    expect(megaReward({ won: false, correctCount: 0 })).toEqual({ xp: 0, coins: 0, tp: 0 });
  });

  it("does not scale a clear with how it was cleared", () => {
    expect(megaReward({ won: true, correctCount: 40 })).toEqual(
      megaReward({ won: true, correctCount: 20 }),
    );
  });
});
