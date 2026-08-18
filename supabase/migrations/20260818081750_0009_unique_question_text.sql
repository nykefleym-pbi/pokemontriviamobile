-- A question bank should not be able to hold the same question twice, and the
-- source bank this one is seeded from already does: 4000 rows there carry only
-- 3989 distinct questions once case and surrounding whitespace are normalised.
--
-- Beyond de-duplicating, this makes seeding IDEMPOTENT. A bulk load that has to
-- be retried -- a batch that timed out, a transfer resumed after an
-- interruption -- can be re-run safely with `on conflict do nothing` instead of
-- silently doubling the bank. That property is worth more than the constraint.
create unique index curated_questions_question_norm_key
  on public.curated_questions (lower(btrim(question)));
