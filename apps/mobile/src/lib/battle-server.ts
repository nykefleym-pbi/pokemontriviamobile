// Client side of the server-authoritative solo battle.
//
// Every function here is a thin transport over the `battle-solo` Edge
// Function. Deliberately thin: the whole point of that function is that the
// battle's MATH happens in exactly one place, so anything in this file that
// started deciding damage, streaks or outcomes would be reintroducing the
// second implementation the architecture exists to prevent.
//
// The client never holds an answer key, which is why `start` sends question
// IDs and the reveal comes back per answer. See SoloBattleCfgRef in
// packages/core for why that shape, and not the web app's.
import type { BattleAction, BattleState, BattleEvent, SoloBattleCfgRef } from "@ptb/core";
import { callEdgeFunction, EdgeFunctionError } from "./edge-function";

const FUNCTION = "battle-solo";

/** Kept as its own name because call sites catch it by name; it is the shared
 *  envelope error, not a second error type. */
export const BattleServerError = EdgeFunctionError;
export type BattleServerError = EdgeFunctionError;

export interface StartedBattle {
  battleId: string;
  seed: string;
}

export function startServerBattle(cfg: SoloBattleCfgRef): Promise<StartedBattle> {
  return callEdgeFunction<StartedBattle>(FUNCTION, { op: "start", cfg });
}

export interface ActionResult {
  state: BattleState;
  events: BattleEvent[];
  /** Present only for `submit_answer` — what the player is now allowed to
   *  know about the question they just answered. */
  reveal: { correctIndex: number; explanation: string } | null;
}

export function submitAction(battleId: string, action: BattleAction): Promise<ActionResult> {
  return callEdgeFunction<ActionResult>(FUNCTION, { op: "submit_action", battleId, action });
}
