-- ---------------------------------------------------------------------------
-- daily_questions: the fixed question set every player gets for a given day.
--
-- This is deliberately NOT a port of the web project's table of the same name.
-- That one stores the day's questions as a jsonb blob that INCLUDES
-- correct_index, behind a `using (true)` public-read policy, and grants its
-- picker RPC to `anon` -- so the day's answer key is readable by anyone with
-- the public anon key. The web migration's own header flags this and leaves it
-- unfixed.
--
-- Here the table stores only the ORDERED IDS of curated_questions rows. The
-- answer key therefore never leaves curated_questions, which already has RLS
-- on with no policies at all. There is no second copy to leak, and freezing
-- the id list still pins the day's set so every player sees the same ten.
-- ---------------------------------------------------------------------------
create table public.daily_questions (
  date          date primary key,
  question_ids  uuid[] not null,
  created_at    timestamptz not null default now(),
  constraint daily_questions_nonempty check (array_length(question_ids, 1) > 0)
);

alter table public.daily_questions enable row level security;
-- No policies whatsoever, matching curated_questions: the only way in is the
-- security-definer function below. Intentional, not an omission.

revoke all on public.daily_questions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Serving. Builds today's set on first call, then returns it with the answer
-- key projected away -- same shape get_trivia_questions returns.
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_questions(_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day  date := coalesce(_date, current_date);
  v_ids  uuid[];
  v_rows jsonb;
begin
  select d.question_ids into v_ids
  from public.daily_questions d
  where d.date = v_day;

  if v_ids is null then
    -- Only TODAY's set is ever created on demand. Without this guard a caller
    -- could walk arbitrary dates and drain the unseen-question window, which
    -- would quietly degrade rotation for everyone.
    if v_day <> current_date then
      raise exception 'no daily set for %', v_day;
    end if;

    with recent as (
      select distinct unnest(r.question_ids) as id
      from (
        select question_ids
        from public.daily_questions
        order by date desc
        limit 50
      ) r
    ),
    picked as (
      ( select c.id from public.curated_questions c
        where c.verified and c.difficulty = 'easy'
          and c.id not in (select id from recent)
        order by random() limit 3 )
      union all
      ( select c.id from public.curated_questions c
        where c.verified and c.difficulty = 'medium'
          and c.id not in (select id from recent)
        order by random() limit 7 )
    )
    select array_agg(p.id) into v_ids from picked p;

    if v_ids is null then
      raise exception 'no verified questions available to build a daily set';
    end if;

    insert into public.daily_questions (date, question_ids)
    values (v_day, v_ids)
    on conflict (date) do nothing;

    -- A concurrent caller may have won the insert. The STORED set is
    -- authoritative -- re-read it so every player gets the same questions.
    select d.question_ids into v_ids
    from public.daily_questions d
    where d.date = v_day;
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) - 'ord' order by q.ord), '[]'::jsonb)
  into v_rows
  from (
    select c.id, c.question, c.options, c.category, c.difficulty, c.type_theme,
           array_position(v_ids, c.id) as ord
      -- correct_index and explanation are withheld; grade_trivia_answer is the
      -- only thing that returns them, and only for an answer already submitted.
    from public.curated_questions c
    where c.id = any(v_ids)
  ) q;

  return v_rows;
end;
$$;

-- Revoke from PUBLIC *first*. Postgres grants EXECUTE on every new function to
-- the PUBLIC pseudo-role and `anon` inherits it, so revoking from `anon` alone
-- is a no-op -- the mistake migration 0004 made and 0005 had to fix.
revoke execute on function public.get_daily_questions(date) from public;
grant  execute on function public.get_daily_questions(date) to authenticated;
