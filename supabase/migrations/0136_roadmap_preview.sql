-- 0136_roadmap_preview.sql
--
-- Roadmap gains a Preview column between In progress and Released: a Vercel
-- preview the board can open before something is live. Status order is
-- proposed → planned → progress → preview → released. preview_url is the
-- optional http(s) link on an item (required in the app when the column is
-- Preview). The Product Manager bot may set it on PATCH /api/roadmap/items/[id].
--
-- Apply via the Supabase SQL editor, after 0135. Idempotent.

begin;

alter table public.olb_roadmap_items
  drop constraint if exists olb_roadmap_items_status_check;
alter table public.olb_roadmap_items
  add constraint olb_roadmap_items_status_check
    check (status in ('released', 'preview', 'progress', 'planned', 'proposed'));

alter table public.olb_roadmap_items
  add column if not exists preview_url text
    check (preview_url is null or char_length(preview_url) between 1 and 500);

comment on column public.olb_roadmap_items.preview_url is
  'Vercel preview (or other http/https) link. Required in the app when status is preview.';

commit;

notify pgrst, 'reload schema';
