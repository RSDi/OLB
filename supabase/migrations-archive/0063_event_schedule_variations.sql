-- Flexible event schedules: monthly recurrence ("last Sunday of the month")
-- plus per-series skip dates (cancel a single occurrence — e.g. the Sunday we
-- meet at the lake instead, or a week replaced by the prophecy conference).
begin;

-- Recurrence frequency. 'weekly' keeps the existing recur_weekdays behaviour;
-- 'monthly' uses the nth/last weekday columns below.
alter table public.events
  add column if not exists recur_freq text not null default 'weekly';

do $$ begin
  alter table public.events
    add constraint events_recur_freq_check check (recur_freq in ('weekly', 'monthly'));
exception when duplicate_object then null; end $$;

-- Monthly pattern: the Nth weekday of the month. recur_monthly_week is 1-4 or
-- -1 for "last"; recur_monthly_weekday is 0=Sun…6=Sat. (Last Sunday = -1, 0.)
alter table public.events
  add column if not exists recur_monthly_week    int,
  add column if not exists recur_monthly_weekday int;

-- Dates to skip within a recurring series (YYYY-MM-DD). The generator and the
-- calendar both drop these occurrences.
alter table public.events
  add column if not exists recur_except date[];

commit;
