-- Undoes 0132: the fund goes back to its 0131 name, and the Buckets for
-- Bucks fundraiser is removed where nothing was logged against it.

update public.olb_program_funds f
   set name = 'Buckets for Bucks', description = 'The general program fund'
 where f.name = 'General program fund'
   and not exists (
     select 1 from public.olb_program_funds g
      where g.board_id = f.board_id and g.name = 'Buckets for Bucks'
   );

delete from public.olb_fundraisers r
 where r.name = 'Buckets for Bucks'
   and not exists (select 1 from public.olb_fundraiser_shifts s where s.fundraiser_id = r.id);
