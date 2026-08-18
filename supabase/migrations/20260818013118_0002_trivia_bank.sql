-- ---------------------------------------------------------------------------
-- curated_questions: the trivia bank.
--
-- The single most important property here is that `correct_index` NEVER
-- reaches the client. In the web app the question rows were served through an
-- RPC for exactly this reason; making it structural (no select policy at all,
-- only a definer function that projects the answer away) means a future
-- careless `select *` from the app cannot leak the answer key.
-- ---------------------------------------------------------------------------
create table public.curated_questions (
  id            uuid primary key default gen_random_uuid(),
  question      text not null,
  options       jsonb not null,
  correct_index int  not null check (correct_index >= 0),
  explanation   text not null default '',
  category      text not null,
  difficulty    text not null check (difficulty in ('easy', 'medium', 'hard')),
  type_theme    text,
  verified      boolean not null default false,
  times_served  int not null default 0,
  times_correct int not null default 0,
  created_at    timestamptz not null default now(),
  constraint curated_questions_options_shape check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
    and correct_index < jsonb_array_length(options)
  )
);

-- The serving path filters on these three and nothing else.
create index curated_questions_serving_idx
  on public.curated_questions (difficulty, verified, times_served)
  where verified;

create index curated_questions_type_theme_idx
  on public.curated_questions (type_theme)
  where type_theme is not null and verified;

alter table public.curated_questions enable row level security;
-- No policies whatsoever: the table is unreachable except through the
-- security-definer functions below. This is intentional, not an omission.

revoke all on public.curated_questions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Serving. Returns questions with the answer stripped.
-- ---------------------------------------------------------------------------
create or replace function public.get_trivia_questions(
  _count      int  default 10,
  _difficulty text default null,
  _type_theme text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if _count < 1 or _count > 50 then
    raise exception 'count must be between 1 and 50';
  end if;

  select coalesce(jsonb_agg(q), '[]'::jsonb) into v_rows
  from (
    select
      c.id,
      c.question,
      c.options,
      c.category,
      c.difficulty,
      c.type_theme
      -- correct_index and explanation are withheld until the answer is graded.
    from public.curated_questions c
    where c.verified
      and (_difficulty is null or c.difficulty = _difficulty)
      and (_type_theme is null or c.type_theme = _type_theme)
    order by random()
    limit _count
  ) q;

  return v_rows;
end;
$$;

grant execute on function public.get_trivia_questions(int, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grading. Deliberately trivial: an integer comparison and two counters.
--
-- NOTHING about damage, streaks, type effectiveness or abilities belongs in
-- here. The web project learned that the hard way -- an answer-handling RPC
-- grew its own copy of the engine's streak and confusion rules, and a fix
-- shipped in TypeScript silently did nothing for human players while working
-- for bots. In this project the engine lives in one place (packages/core,
-- called from an Edge Function) and SQL only persists.
-- ---------------------------------------------------------------------------
create or replace function public.grade_trivia_answer(
  _question_id uuid,
  _choice      int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correct int;
  v_explain text;
  v_is_right boolean;
begin
  select correct_index, explanation into v_correct, v_explain
  from public.curated_questions
  where id = _question_id and verified;

  if not found then
    raise exception 'unknown question';
  end if;

  v_is_right := (_choice = v_correct);

  update public.curated_questions
  set times_served  = times_served + 1,
      times_correct = times_correct + (case when v_is_right then 1 else 0 end)
  where id = _question_id;

  return jsonb_build_object(
    'correct',       v_is_right,
    'correct_index', v_correct,
    'explanation',   v_explain
  );
end;
$$;

grant execute on function public.grade_trivia_answer(uuid, int)
  to anon, authenticated;
