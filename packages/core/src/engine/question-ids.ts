// The rule for "a list of question ids a client may start a run with".
//
// Shared by solo battles (SoloBattleCfgRef) and Mega raids (MegaRunCfgRef)
// because the interesting part of it is a CHEATING rule, and a cheating rule
// that exists in two copies is one edit away from existing in one.
//
// On this project the client picks its own questions -- `get_trivia_questions`
// returns a random set and the device names them back by id -- so the server
// cannot vet WHICH questions a run uses. What it can insist on is the shape of
// the request, and that shape is load-bearing.

/** The same ceiling `get_trivia_questions` enforces on a single fetch. A list
 *  is client-supplied, so without a cap one request could name an unbounded
 *  number of ids and make every replay of that run proportionally expensive. */
export const MAX_QUESTIONS_PER_BATTLE = 50;

/**
 * True when `value` is a well-formed, non-cheating list of question ids.
 *
 * DUPLICATES ARE REJECTED, and that is the rule worth understanding. Every
 * answer's reveal names the correct option, so a set of `[X, X, X, X]` would
 * let a player miss the first question and then answer the same question
 * right for the rest of the run. The ids being distinct is what makes each
 * reveal worth only the question it belongs to.
 *
 * `min` differs by mode: a solo battle is playable at any length, while a Mega
 * raid needs enough questions to be winnable at all (see MEGA_MIN_QUESTIONS).
 */
export function isValidQuestionIdList(
  value: unknown,
  min = 1,
  max = MAX_QUESTIONS_PER_BATTLE,
): value is string[] {
  if (!Array.isArray(value)) return false;
  return (
    value.length >= min &&
    value.length <= max &&
    value.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(value).size === value.length
  );
}
