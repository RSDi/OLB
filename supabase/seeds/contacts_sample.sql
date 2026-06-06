-- Sample seed for the contacts feature. Run by hand in a dev environment
-- after migrations 0036 + 0037 have been applied.
--
--   psql $DEV_DATABASE_URL -f supabase/seeds/contacts_sample.sql
--
-- Idempotent — each row is name-checked before insert, so re-running this
-- script does not duplicate. Drops in five sample vendor companies across
-- different categories plus a couple of people at those companies so the
-- company + person model gets exercised right out of the gate.

begin;

-- ---------------------------------------------------------------------------
-- 1. Companies, one per category.
-- ---------------------------------------------------------------------------

with cat as (select id, lower(name) as name from public.contact_categories where deleted_at is null)
insert into public.contacts (kind, category_id, name, email, phone, website, address, account_number, reorder_notes, quote_contact_notes, tags)
select * from (values
  ('company',
   (select id from cat where name = 'plumbing'),
   'ABC Plumbing & Drain',
   'service@abcplumbing.example',
   '(555) 201-1100',
   'abcplumbing.example',
   '123 Maple Ave, Springfield, NE',
   'MCC-4421',
   'After-hours dispatcher answers 24/7. For non-emergency, schedule online and reference account MCC-4421.',
   'Ask for Dave for any job over $500. He''ll match other written bids.',
   array['preferred','emergency']
  ),
  ('company',
   (select id from cat where name = 'electrical'),
   'Bright Spark Electric',
   'office@brightspark.example',
   '(555) 333-7100',
   'brightspark.example',
   '450 Industrial Pkwy, Omaha, NE',
   'MCC-COMM-12',
   'For breaker replacements: order through the contractor portal, not email. Lead time 3-5 days.',
   'Field estimator: Marisol. Same-week visits if scheduled by Monday.',
   array['preferred']
  ),
  ('company',
   (select id from cat where name = 'office supplies'),
   'Heartland Office Supply',
   'orders@heartlandoffice.example',
   '(555) 410-2222',
   'heartlandoffice.example',
   null,
   'C-9087',
   'Free delivery on orders > $75. Charge to net-30 account. Items reorder on the 1st & 15th — set a reminder.',
   'Sales rep Tom T. handles all bulk pricing.',
   array['recurring']
  ),
  ('company',
   (select id from cat where name = 'hvac'),
   'Comfort Climate Co.',
   'service@comfortclimate.example',
   '(555) 808-9090',
   'comfortclimate.example',
   '12 Industrial Blvd, Lincoln, NE',
   'MCC-HVAC-31',
   'Annual contract pricing. Spring + Fall PM visits included. Call dispatcher and reference contract #31.',
   'For new install quotes, request engineering review. Add 2 weeks to lead time.',
   array['contract','preferred']
  ),
  ('company',
   (select id from cat where name = 'contractor'),
   'Sundance Construction',
   'projects@sundance.example',
   '(555) 555-2020',
   'sundance.example',
   '88 Builder Way, Springfield, NE',
   null,
   null,
   'General GC for any work over $5k. Send RFQ via their portal; expect 5-7 business days.',
   array['gc']
  )
) as src(kind, category_id, name, email, phone, website, address, account_number, reorder_notes, quote_contact_notes, tags)
where not exists (
  select 1 from public.contacts c
  where lower(c.name) = lower(src.name) and c.deleted_at is null
);

-- ---------------------------------------------------------------------------
-- 2. People at those companies (parent_contact_id pointing at the company).
-- ---------------------------------------------------------------------------

insert into public.contacts (kind, parent_contact_id, category_id, name, email, mobile_phone, notes, tags)
select 'person',
       p.id,
       p.category_id,
       v.person_name,
       v.email,
       v.mobile_phone,
       v.notes,
       v.tags
from (values
  ('ABC Plumbing & Drain',     'Dave Reynolds',  'dave@abcplumbing.example',   '(555) 201-1199', 'Owner. Best for negotiating estimates over $500.',                       array['preferred']),
  ('Bright Spark Electric',    'Marisol Vega',   'marisol@brightspark.example', '(555) 333-7142', 'Field estimator. Will visit on short notice if asked Monday morning.',  array['preferred']),
  ('Heartland Office Supply',  'Tom Tanaka',     'tom@heartlandoffice.example', '(555) 410-2245', 'Bulk pricing rep. Send a list, he comes back with a sheet within a day.', array['sales'])
) as v(company_name, person_name, email, mobile_phone, notes, tags)
join public.contacts p on lower(p.name) = lower(v.company_name) and p.deleted_at is null
where not exists (
  select 1 from public.contacts c
  where lower(c.name) = lower(v.person_name) and c.deleted_at is null
);

commit;
