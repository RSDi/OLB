-- The scorer's table PIN is four digits now (New PIN makes four). Allow 4 to
-- 6 so a six-digit PIN already handed out keeps working until it's replaced.
alter table public.hs_hosted drop constraint if exists hs_hosted_scorer_pin_check;
alter table public.hs_hosted
  add constraint hs_hosted_scorer_pin_check check (scorer_pin is null or scorer_pin ~ '^[0-9]{4,6}$');
