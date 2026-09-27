-- 0067_backfill_phone_area_codes.sql
--
-- The directory import (scripts/import-directory.ts) stored phone numbers
-- verbatim from Luann's spreadsheet, which used bare 7-digit local numbers
-- (e.g. "895-6265") — the 402 area code was omitted (single-area-code region).
-- Prepend "402-" to any member phone/home_phone whose digits total exactly 7.
--
-- Safe + idempotent: only rows with exactly 7 digits are touched; 10-digit
-- (already-prefixed) and empty values are left alone, so re-running is a no-op.
-- If a member is genuinely outside 402, fix that one row by hand afterward.

begin;

update public.members
set phone = '402-' || phone
where phone is not null
  and regexp_replace(phone, '\D', '', 'g') ~ '^[0-9]{7}$';

update public.members
set home_phone = '402-' || home_phone
where home_phone is not null
  and regexp_replace(home_phone, '\D', '', 'g') ~ '^[0-9]{7}$';

commit;
