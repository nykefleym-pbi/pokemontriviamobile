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
import { supabase } from "./supabase";

const FUNCTION = "battle-solo";

/** The envelope every op returns. Errors are DATA, not exceptions: the
 *  function answers 4xx/409 with a machine-readable code for things the UI has
 *  to distinguish (a stale action vs. a dead session), and supabase-js turns a
 *  non-2xx into a thrown FunctionsHttpError rather than surfacing the body. */
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; msg: string } };

export class BattleServerError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "BattleServerError";
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<Envelope<T>>(FUNCTION, { body });

  // A non-2xx arrives here as `error` with the parsed body out of reach, so
  // read it back off the response before falling back to the generic message.
  if (error) {
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === "function") {
      try {
        const parsed = (await res.json()) as Envelope<T>;
        if (parsed && parsed.ok === false) {
          throw new BattleServerError(parsed.error.code, parsed.error.msg);
        }
      } catch (e) {
        if (e instanceof BattleServerError) throw e;
        // fall through to the transport error below
      }
    }
    throw new BattleServerError("transport", error.message);
  }

  if (!data) throw new BattleServerError("empty_response", "the server returned nothing");
  if (!data.ok) throw new BattleServerError(data.error.code, data.error.msg);
  return data.data;
}

export interface StartedBattle {
  battleId: string;
  seed: string;
}

export function startServerBattle(cfg: SoloBattleCfgRef): Promise<StartedBattle> {
  return call<StartedBattle>({ op: "start", cfg });
}

export interface ActionResult {
  state: BattleState;
  events: BattleEvent[];
  /** Present only for `submit_answer` — what the player is now allowed to
   *  know about the question they just answered. */
  reveal: { correctIndex: number; explanation: string } | null;
}

export function submitAction(battleId: string, action: BattleAction): Promise<ActionResult> {
  return call<ActionResult>({ op: "submit_action", battleId, action });
}
