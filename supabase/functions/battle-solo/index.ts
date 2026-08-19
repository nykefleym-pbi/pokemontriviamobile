// The server-authoritative solo battle.
//
// This is the piece ROADMAP Phase 2 calls "the single biggest correctness win
// available from starting over": turns resolve in ONE place. This function
// replays the whole action log through packages/core and derives the next
// state itself, rather than trusting a client-reported HP or damage number.
// SQL only persists.
//
// THREE THINGS DIFFER FROM THE WEB APP'S EQUIVALENT, and all three are
// load-bearing:
//
// 1. THE CLIENT NEVER SENDS QUESTIONS. The web app embeds the whole question
//    set -- answers included -- in `solo_battles.cfg` at `start`, reasoning
//    that the client already holds the questions in order to display them.
//    That is false here by design: `curated_questions` has RLS on with no
//    policies at all, `get_trivia_questions` projects `correct_index` away,
//    and grading is a server round-trip. So the client sends a
//    SoloBattleCfgRef -- the battle's facts plus ORDERED QUESTION IDS -- and
//    this function resolves them against `curated_questions` on every action.
//
//    The ref is also what gets STORED. `solo_battles` has a select policy for
//    its owner, so a hydrated cfg in that column would hand the answer key
//    straight back to the player it is being withheld from. The hydrated set
//    exists only in memory, for the length of one request.
//
// 2. SERVICE ROLE, NOT ANON. `solo_battles` has a select policy for its owner
//    and NO insert/update/delete policy at all (migration 0003), so an
//    authenticated caller cannot write to it -- by design. This function
//    therefore holds the service-role key, which bypasses RLS. The direct
//    consequence: RLS is no longer scoping anything here, so EVERY query must
//    filter `user_id` explicitly. Forget that and one player can read or
//    mutate another's battle. The caller's identity is established separately,
//    from their JWT, before any of it.
//
// 3. STATUS VOCABULARY. The engine's phase is
//    "in_progress" | "won" | "lost". The table's check constraint allows
//    "active" | "won" | "lost" | "forfeit" | "expired". They are NOT the same
//    word for the running state, and a straight write of `phase` fails the
//    constraint. `dbStatus` maps between them, in one place.
//
// BUILD: this file is not what gets deployed. Deno cannot resolve its relative
// imports into packages/core without the whole repo present, and Supabase's
// deploy API takes a flat file list. Run
// `node scripts/bundle-edge-function.mjs battle-solo` and deploy the bundle.
// Never hand-edit the bundle.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  applyNextAction,
  SoloBattleActionError,
} from "../../../packages/core/src/engine/solo-battle-replay.ts";
import {
  isValidSoloBattleCfgRef,
  type SoloBattleCfg,
  type SoloBattleCfgRef,
} from "../../../packages/core/src/engine/solo-battle-config.ts";
import {
  isValidBattleAction,
  type BattleAction,
  type BattleState,
} from "../../../packages/core/src/engine/turn.ts";
import type { Trivia } from "../../../packages/core/src/lib/trivia-core.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; msg: string } };

function json<T>(body: Envelope<T>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(code: string, msg: string, status: number) {
  return json({ ok: false, error: { code, msg } }, status);
}

/** engine phase -> the table's status vocabulary. See note 3 above. */
function dbStatus(phase: BattleState["phase"]): "active" | "won" | "lost" {
  return phase === "in_progress" ? "active" : phase;
}

/** Resolves a stored ref's `questionIds` into the answer-bearing set the
 *  engine replays with. Held in memory only -- never written back, never
 *  returned to the caller.
 *
 *  Returns null if ANY id is unknown or unverified, rather than silently
 *  playing a shorter battle: `questionIds.length` determines how many
 *  questions the battle has, and a set that quietly shrank would make
 *  `question_idx_out_of_range` fire on a question the player can plainly see
 *  on screen. */
async function hydrate(db: SupabaseClient, ref: SoloBattleCfgRef): Promise<SoloBattleCfg | null> {
  const { data, error } = await db
    .from("curated_questions")
    .select("id, question, options, correct_index, explanation, category")
    .in("id", ref.questionIds)
    .eq("verified", true);
  if (error || !data) return null;

  const byId = new Map(data.map((row) => [row.id as string, row]));
  const questions: Trivia[] = [];
  for (const id of ref.questionIds) {
    const row = byId.get(id);
    if (!row) return null;
    questions.push({
      question: row.question as string,
      options: row.options as string[],
      correct: row.correct_index as number,
      explanation: row.explanation as string,
      category: row.category as string,
    });
  }
  return { ...ref, questions };
}

/** What the player is told after answering: which option was right, and why.
 *
 *  This is exactly what `grade_trivia_answer` already hands to the client, so
 *  returning it here leaks nothing new -- it just collapses two round-trips
 *  into one now that the battle call has to happen anyway. Calling the RPC
 *  rather than reimplementing it also keeps `times_served`/`times_correct`
 *  moving through the single function that owns them, atomically. The
 *  migration 0002 header is explicit that answer handling must not sprout a
 *  second implementation; this is that rule applied to the counters. */
async function reveal(
  db: SupabaseClient,
  questionId: string,
  choiceIdx: number,
): Promise<{ correctIndex: number; explanation: string } | null> {
  const { data, error } = await db.rpc("grade_trivia_answer", {
    _question_id: questionId,
    _choice: choiceIdx,
  });
  if (error || !data) return null;
  const g = data as { correct_index: number; explanation: string };
  return { correctIndex: g.correct_index, explanation: g.explanation };
}

interface StartOp {
  op: "start";
  cfg: unknown;
}
interface GetOp {
  op: "get";
  battleId: string;
}
interface SubmitActionOp {
  op: "submit_action";
  battleId: string;
  action: unknown;
}
type Body = StartOp | GetOp | SubmitActionOp;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err("method_not_allowed", "POST only", 405);
  if (!SERVICE_KEY) return err("misconfigured", "service role key is not set", 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err("unauthorized", "missing Authorization header", 401);

  // Identity comes from the caller's own JWT, read with the anon key.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace(/^Bearer /, "");
  const { data: userData, error: userErr } = await asCaller.auth.getUser(token);
  if (userErr || !userData.user) return err("unauthorized", "no valid session", 401);
  const userId = userData.user.id;

  // Writes go through the service role, which bypasses RLS -- so every query
  // below scopes user_id itself.
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return err("bad_json", "invalid JSON body", 400);
  }

  if (body.op === "start") {
    if (!isValidSoloBattleCfgRef(body.cfg)) {
      return err("bad_request", "cfg is missing or malformed", 400);
    }
    // Resolve the ids up front so a battle can never be started against
    // questions that will fail to hydrate on the first answer.
    if (!(await hydrate(db, body.cfg))) {
      return err("unknown_questions", "one or more question ids are unknown or unverified", 400);
    }
    const seed = crypto.randomUUID();
    const { data, error } = await db
      .from("solo_battles")
      .insert({ user_id: userId, seed, cfg: body.cfg, status: "active", log: [] })
      .select("id, seed")
      .single();
    if (error) return err("db_error", error.message, 500);
    return json({ ok: true, data: { battleId: data.id, seed: data.seed } });
  }

  if (body.op === "get") {
    if (typeof body.battleId !== "string" || !body.battleId) {
      return err("bad_request", "battleId is required", 400);
    }
    // `cfg` here is the stored ref, which carries no answers.
    const { data, error } = await db
      .from("solo_battles")
      .select("id, seed, cfg, log, status, result")
      .eq("id", body.battleId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return err("db_error", error.message, 500);
    if (!data) return err("not_found", "no battle with that id", 404);
    return json({ ok: true, data });
  }

  if (body.op === "submit_action") {
    if (typeof body.battleId !== "string" || !body.battleId) {
      return err("bad_request", "battleId is required", 400);
    }
    if (!isValidBattleAction(body.action)) {
      return err("bad_request", "action is missing or malformed", 400);
    }
    const action = body.action as BattleAction;

    const { data: row, error: selError } = await db
      .from("solo_battles")
      .select("id, seed, cfg, log, status")
      .eq("id", body.battleId)
      .eq("user_id", userId)
      .maybeSingle();
    if (selError) return err("db_error", selError.message, 500);
    if (!row) return err("not_found", "no battle with that id", 404);
    if (!isValidSoloBattleCfgRef(row.cfg)) {
      return err("corrupt_row", "this battle's cfg is malformed", 500);
    }

    const ref = row.cfg as SoloBattleCfgRef;
    const cfg = await hydrate(db, ref);
    if (!cfg) {
      return err("unknown_questions", "this battle's questions can no longer be resolved", 409);
    }

    const existingLog = (row.log ?? []) as BattleAction[];
    let result;
    try {
      result = applyNextAction(cfg, existingLog, row.seed, action);
    } catch (e) {
      if (e instanceof SoloBattleActionError) return err(e.code, e.message, 409);
      throw e;
    }

    const ended = result.state.phase !== "in_progress";
    // The table's check constraint requires result to be null while active and
    // non-null once finished -- so these two always move together.
    const { error: updError } = await db
      .from("solo_battles")
      .update({
        log: [...existingLog, action],
        status: dbStatus(result.state.phase),
        result: ended
          ? {
              won: result.state.phase === "won",
              maxStreak: result.state.maxStreak,
              correctCount: result.state.correctCount,
            }
          : null,
      })
      .eq("id", body.battleId)
      .eq("user_id", userId);
    if (updError) return err("db_error", updError.message, 500);

    // Only AFTER the action is durably logged: this bumps the question's
    // served/correct counters, and a reveal for an action that was rejected or
    // failed to persist would count a question the player never actually
    // consumed.
    const answered =
      action.type === "submit_answer"
        ? await reveal(db, ref.questionIds[action.questionIdx], action.choiceIdx)
        : null;

    return json({
      ok: true,
      data: { state: result.state, events: result.lastEvents, reveal: answered },
    });
  }

  return err("bad_op", "op must be start, get, or submit_action", 400);
});
