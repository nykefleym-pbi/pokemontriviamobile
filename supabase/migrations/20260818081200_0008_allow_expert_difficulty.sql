-- The mobile schema was authored with three difficulty tiers. The web project's
-- bank -- the source this table is seeded from -- has FOUR, and the fourth is
-- load-bearing rather than stray data:
--
--   easy 792 | medium 1872 | hard 944 | expert 392
--
--   src/lib/game-data.ts     type CuratedDifficulty = easy|medium|hard|expert
--   src/routes/battle.tsx    Elite Four requests difficultyTiers ["hard","expert"]
--   src/lib/game-data.ts     a "master" tier maps to ["hard","expert"]
--   src/routes/api.mega-questions.ts  Mega raids draw across the same four tiers
--
-- Collapsing expert into hard would seed fine and lose information that cannot
-- be recovered afterwards: once 392 expert rows are stored as hard, nothing
-- distinguishes them from the 944 that were always hard, and Phase 5's Elite
-- Four and Mega raids both need that separation. Widening the constraint is the
-- lossless direction and the reversible one.
--
-- Nothing else changes: get_daily_questions still picks 3 easy + 7 medium, and
-- get_trivia_questions still filters on whatever it is passed.
alter table public.curated_questions
  drop constraint curated_questions_difficulty_check;

alter table public.curated_questions
  add constraint curated_questions_difficulty_check
  check (difficulty in ('easy', 'medium', 'hard', 'expert'));
