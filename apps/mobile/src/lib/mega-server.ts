// Client side of the server-authoritative Mega raid.
//
// The shape here differs from solo battles in one way worth naming: the client
// does NOT choose the questions. `start` sends nothing and gets back both a run
// id and the questions the server picked for it, minus the answer key. That is
// what stops a player from difficulty-shopping a raid, and it is why there is
// no `cfg` argument below.
//
// The device therefore never knows whether an answer was right until the server
// says so, and never knows the reward until the run has ended.
import type { MegaRaidState } from "@ptb/core/mega";
import type { MegaRaidAction } from "@ptb/core/mega-replay";
import type { MegaReward } from "@ptb/core/rewards";
import { callEdgeFunction, EdgeFunctionError } from "./edge-function";

const FUNCTION = "mega-run";

export const MegaServerError = EdgeFunctionError;
export type MegaServerError = EdgeFunctionError;

/** A question as the client is allowed to see it: no id, no correct index, no
 *  explanation. The reveal that arrives with each answer carries those. */
export interface ServedQuestion {
  question: string;
  options: string[];
  category: string;
}

export type { MegaReward };

export interface StartedRaid {
  runId: string;
  totalQuestions: number;
  questions: ServedQuestion[];
}

export function startRaid(): Promise<StartedRaid> {
  return callEdgeFunction<StartedRaid>(FUNCTION, { op: "start" });
}

export interface RaidSnapshot extends StartedRaid {
  state: MegaRaidState;
  status: "active" | "won" | "lost";
  result: { won: boolean; correctCount: number; bossHp: number } | null;
  reward: MegaReward | null;
  rewardClaimed: boolean;
}

/** Resume: the server replays its own log, so a reinstalled app or a killed
 *  process picks the raid back up exactly where it was. */
export function getRaid(runId: string): Promise<RaidSnapshot> {
  return callEdgeFunction<RaidSnapshot>(FUNCTION, { op: "get", runId });
}

export interface MegaActionResult {
  state: MegaRaidState;
  /** Present only for `answer` — what the player may now know about the
   *  question they just answered. */
  reveal: { correctIndex: number; explanation: string } | null;
  /** Non-null exactly on the action that ends the raid. Earning it and
   *  collecting it are separate steps; see `claimRaidReward`. */
  reward: MegaReward | null;
}

/** `MegaRaidAction`, not `StoredMegaRaidAction`: the wire form carries no
 *  `correct` flag, because the server resolves correctness itself and bakes it
 *  into the log. A client that could send `correct` would be grading itself. */
export function submitRaidAction(
  runId: string,
  action: MegaRaidAction,
): Promise<MegaActionResult> {
  return callEdgeFunction<MegaActionResult>(FUNCTION, { op: "submit_action", runId, action });
}

/** Pays out once, ever. A second call answers `already_claimed`, which is what
 *  makes it safe to call on every mount of the results screen. */
export function claimRaidReward(runId: string): Promise<{ reward: MegaReward }> {
  return callEdgeFunction<{ reward: MegaReward }>(FUNCTION, { op: "claim_reward", runId });
}
