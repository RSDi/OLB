-- 0132: the general program fund, and Buckets for Bucks as a fundraiser.
--
-- 0131 named the club's general fund "Buckets for Bucks". Buckets for Bucks
-- is a fundraiser; what it raises goes to the general program fund. So the
-- fund is renamed (its shifts, income and totals stay with it), and Buckets
-- for Bucks is added as a fundraiser next to Nelson's Produce on every
-- season that has fundraisers. Data only: no tables or policies change.

update public.olb_program_funds f
   set name = 'General program fund',
       description = 'Program costs for the whole club. Buckets for Bucks raises money for it.'
 where f.name = 'Buckets for Bucks'
   and not exists (
     select 1 from public.olb_program_funds g
      where g.board_id = f.board_id and g.name = 'General program fund'
   );

insert into public.olb_fundraisers (board_id, name, rate_cents)
select distinct board_id, 'Buckets for Bucks', 0
  from public.olb_fundraisers
on conflict (board_id, name) do nothing;
