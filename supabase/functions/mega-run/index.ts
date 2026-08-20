// The server-authoritative Mega raid.
//
// Same job as battle-solo, for the other mode that pays out: replay the run's
// action log through packages/core and derive the outcome here, so a client
// cannot report a clear it did not earn. SQL only persists.
//
// FOUR THINGS TO KNOW, all of them load-bearing:
//
// 1. THE SERVER PICKS THE QUESTIONS. The client sends nothing about them --
//    not ids, not a count. This is the lesson of migration 0013, which
//    battle-solo does NOT yet follow: `get_trivia_questions` is granted to
//    `authenticated` and takes a `_difficulty` argument, so a client that
//    names its own question ids is choosing its own difficulty, and no
//    validation of that id list can tell the difference. `pick_mega_questions`
//    is service-role only and fixes the mix.
//
//    What is STORED is still only the ids (migration 0014). The row is
//    readable by its owner, so the answer key must not be in it -- the same
//    hole migration 0011 had to close for solo_battles.cfg with column grants.
//    Storing ids means there is nothing to hide.
//
// 2. CORRECTNESS IS RESOLVED ONCE, AT SUBMIT TIME, and baked into the stored
//    action as `correct`. packages/core's mega-battle-replay.ts is built
//    around this: replaying a stored log is pure and needs no database access,
//    and a question is looked up once no matter how often the run is replayed.
//    This is the one real structural difference from battle-solo, which
//    re-resolves the whole set on every action.
//
// 3. SERVICE ROLE, NOT ANON. `mega_runs` has a select policy for its owner and
//    no insert/update/delete policy at all, so this function holds the
//    service-role key and RLS scopes nothing here. EVERY query must filter
//    `user_id` itself. The caller's identity is established separately, from
//    their JWT, before any of it.
//
// 4. THE WALLET IS STILL THE CLIENT'S. Coins, TP and the inventory live in
//    `saves.state`, which the client authors. So `reward` here is the
//    authoritative AMOUNT and `reward_claimed_at` makes collecting it a
//    one-time event -- a player cannot invent a clear, inflate the purse, or
//    collect twice -- but the balance it lands in is as trustworthy as the
//    rest of the economy, which is to say not very. Items are the same tier:
//    the client checks and consumes its own inventory, then tells us. Moving
//    the wallet server-side is a separate, larger change.
//
// BUILD: this file is not what gets deployed. Run
// `node scripts/bundle-edge-function.mjs mega-run` and deploy the bundle.
// Never hand-edit the bundle.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  applyNextMegaAction,
  isValidMegaRaidAction,
  replayMegaLog,
  MegaRaidActionError,
  type MegaRaidAction,
  type StoredMegaRaidAction,
} from "../../../packages/core/src/engine/mega-battle-replay.ts";
import {
  MEGA_MIN_QUESTIONS,
  type MegaRaidState,
} from "../../../packages/core/src/engine/mega-replay.ts";
import { megaReward } from "../../../packages/core/src/lib/rewards/index.ts";
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

/** A question as the CLIENT is allowed to see it: no `correct_index`, no
 *  `explanation`, and no id -- the client answers by position, so an id would
 *  only give it something to correlate against the bank. */
interface PublicQuestion {
  question: string;
  options: string[];
  category: string;
}

/** Loads the display half of a run's questions, in the run's own order. */
async function publicQuestions(
  db: SupabaseClient,
  questionIds: string[],
): Promise<PublicQuestion[] | null> {
  const { data, error } = await db
    .from("curated_questions")
    .select("id, question, options, category")
    .in("id", questionIds);
  if (error || !data) return null;

  const byId = new Map(data.map((row) => [row.id as string, row]));
  const out: PublicQuestion[] = [];
  for (const id of questionIds) {
    const row = byId.get(id);
    if (!row) return null;
    out.push({
      question: row.question as string,
      options: row.options as string[],
      category: row.category as string,
    });
  }
  return out;
}

/** Resolves one submitted answer against the held key, and tells the player
 *  what it was.
 *
 *  Goes through `grade_trivia_answer` rather than reading `correct_index`
 *  directly so that `times_served`/`times_correct` keep moving through the one
 *  function that owns them, atomically. A timed-out answer (`choiceIdx: null`)
 *  is graded as -1: no option can equal it, so it counts as served and wrong,
 *  which is exactly what a timeout is. */
async function grade(
  db: SupabaseClient,
  questionId: string,
  choiceIdx: number | null,
): Promise<{ correct: boolean; correctIndex: number; explanation: string } | null> {
  const { data, error } = await db.rpc("grade_trivia_answer", {
    _question_id: questionId,
    _choice: choiceIdx ?? -1,
  });
  if (error || !data) return null;
  const g = data as { correct: boolean; correct_index: number; explanation: string };
  return { correct: g.correct === true, correctIndex: g.correct_index, explanation: g.explanation };
}

interface RunRow {
  id: string;
  question_ids: string[];
  log: StoredMegaRaidAction[];
  status: string;
  result: unknown;
  reward: unknown;
  reward_claimed_at: string | null;
}

function endedFields(state: MegaRaidState) {
  const won = state.phase === "won";
  return {
    status: state.phase,
    result: { won, correctCount: state.correctCount, bossHp: state.bossHp },
    reward: megaReward({ won, correctCount: state.correctCount }),
  };
}

type Body =
  | { op: "start" }
  | { op: "get"; runId: string }
  | { op: "submit_action"; runId: string; action: unknown }
  | { op: "claim_reward"; runId: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err("method_not_allowed", "POST only", 405);
  if (!SERVICE_KEY) return err("misconfigured", "service role key is not set", 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err("unauthorized", "missing Authorization header", 401);

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser(
    authHeader.replace(/^Bearer /, ""),
  );
  if (userErr || !userData.user) return err("unauthorized", "no valid session", 401);
  const userId = userData.user.id;

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
    const { data: picked, error: pickErr } = await db.rpc("pick_mega_questions", {
      _count: MEGA_MIN_QUESTIONS,
    });
    if (pickErr) return err("db_error", pickErr.message, 500);

    const rows = (picked ?? []) as { id: string; question: string; options: string[]; category: string }[];
    // The clamp inside pick_mega_questions bounds the ARGUMENT, not the bank.
    // If the bank cannot supply a winnable set, refuse rather than start a raid
    // that cannot be cleared.
    if (rows.length < MEGA_MIN_QUESTIONS) {
      return err(
        "not_enough_questions",
        `a raid needs ${MEGA_MIN_QUESTIONS} questions, the bank returned ${rows.length}`,
        503,
      );
    }

    const questionIds = rows.map((r) => r.id);
    const { data, error } = await db
      .from("mega_runs")
      .insert({ user_id: userId, question_ids: questionIds, log: [], status: "active" })
      .select("id")
      .single();
    if (error) return err("db_error", error.message, 500);

    return json({
      ok: true,
      data: {
        runId: data.id,
        totalQuestions: questionIds.length,
        questions: rows.map((r) => ({
          question: r.question,
          options: r.options,
          category: r.category,
        })),
      },
    });
  }

  if (body.op === "get") {
    if (typeof body.runId !== "string" || !body.runId) {
      return err("bad_request", "runId is required", 400);
    }
    const { data: row, error } = await db
      .from("mega_runs")
      .select("id, question_ids, log, status, result, reward, reward_claimed_at")
      .eq("id", body.runId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return err("db_error", error.message, 500);
    if (!row) return err("not_found", "no run with that id", 404);

    const run = row as RunRow;
    const questions = await publicQuestions(db, run.question_ids);
    if (!questions) return err("unknown_questions", "this run's questions cannot be resolved", 409);

    return json({
      ok: true,
      data: {
        runId: run.id,
        totalQuestions: run.question_ids.length,
        questions,
        state: replayMegaLog(run.question_ids.length, run.log ?? []),
        status: run.status,
        result: run.result,
        reward: run.reward,
        rewardClaimed: run.reward_claimed_at !== null,
      },
    });
  }

  if (body.op === "submit_action") {
    if (typeof body.runId !== "string" || !body.runId) {
      return err("bad_request", "runId is required", 400);
    }
    if (!isValidMegaRaidAction(body.action)) {
      return err("bad_request", "action is missing or malformed", 400);
    }
    const action = body.action as MegaRaidAction;

    const { data: row, error: selErr } = await db
      .from("mega_runs")
      .select("id, question_ids, log, status, result, reward, reward_claimed_at")
      .eq("id", body.runId)
      .eq("user_id", userId)
      .maybeSingle();
    if (selErr) return err("db_error", selErr.message, 500);
    if (!row) return err("not_found", "no run with that id", 404);

    const run = row as RunRow;
    const total = run.question_ids.length;
    const existingLog = (run.log ?? []) as StoredMegaRaidAction[];

    // Resolve an answer's correctness here, once, and store it on the action.
    let stored: StoredMegaRaidAction;
    let reveal: { correctIndex: number; explanation: string } | null = null;
    if (action.type === "answer") {
      if (
        !Number.isInteger(action.questionIdx) ||
        action.questionIdx < 0 ||
        action.questionIdx >= total
      ) {
        return err("question_idx_out_of_range", `question ${action.questionIdx} is not in this run`, 409);
      }
      // No skipping and no re-answering: the next answer is the next question.
      const expectedIdx = existingLog.filter((a) => a.type === "answer").length;
      if (action.questionIdx !== expectedIdx) {
        return err(
          "unexpected_question_idx",
          `expected an answer for question ${expectedIdx}, got ${action.questionIdx}`,
          409,
        );
      }
      const graded = await grade(db, run.question_ids[action.questionIdx], action.choiceIdx);
      if (!graded) return err("unknown_questions", "this question can no longer be graded", 409);
      stored = { ...action, correct: graded.correct };
      reveal = { correctIndex: graded.correctIndex, explanation: graded.explanation };
    } else {
      stored = action;
    }

    let applied;
    try {
      applied = applyNextMegaAction(total, existingLog, stored);
    } catch (e) {
      if (e instanceof MegaRaidActionError) return err(e.code, e.message, 409);
      throw e;
    }

    // Computed once: what is written to the row and what is returned to the
    // player have to be the same reward, and two calls to megaReward is how
    // they would quietly stop being.
    const finish =
      applied.state.phase === "in_progress" ? null : endedFields(applied.state);

    const { error: updErr } = await db
      .from("mega_runs")
      .update({
        log: applied.log,
        ...(finish ?? { status: "active", result: null, reward: null }),
      })
      .eq("id", body.runId)
      .eq("user_id", userId);
    if (updErr) return err("db_error", updErr.message, 500);

    return json({
      ok: true,
      data: { state: applied.state, reveal, reward: finish?.reward ?? null },
    });
  }

  if (body.op === "claim_reward") {
    if (typeof body.runId !== "string" || !body.runId) {
      return err("bad_request", "runId is required", 400);
    }
    // The claim is the guard, so it must be one statement: only a row that is
    // finished AND unclaimed is updated. Two clients racing the same run mean
    // one UPDATE matches and the other matches nothing -- which is the whole
    // point of doing it this way rather than read-then-write.
    const { data, error } = await db
      .from("mega_runs")
      .update({ reward_claimed_at: new Date().toISOString() })
      .eq("id", body.runId)
      .eq("user_id", userId)
      .neq("status", "active")
      .is("reward_claimed_at", null)
      .select("reward")
      .maybeSingle();
    if (error) return err("db_error", error.message, 500);

    if (!data) {
      // Nothing was updated. Say which of the three reasons it was, because
      // "already claimed" is a normal thing for a retrying client to hit and
      // must not look like a failure worth retrying again.
      const { data: row } = await db
        .from("mega_runs")
        .select("status, reward, reward_claimed_at")
        .eq("id", body.runId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!row) return err("not_found", "no run with that id", 404);
      if (row.status === "active") return err("run_in_progress", "this run has not ended", 409);
      return err("already_claimed", "this reward was already collected", 409);
    }

    return json({ ok: true, data: { reward: data.reward } });
  }

  return err("bad_op", "op must be start, get, submit_action, or claim_reward", 400);
});
