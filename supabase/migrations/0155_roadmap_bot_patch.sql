-- 0155_roadmap_bot_patch.sql
--
-- Product Manager bot PATCH writes the column change and the history row
-- in one transaction (bot_patch_roadmap_item). The update only lands if
-- the card is still in the expected column; otherwise the function raises
-- conflict (HTTP 409). A failed history insert rolls the move back, so a
-- retry cannot log twice for a half-applied write.
--
-- Service role only (same as the bot's other writes). Invoker, not definer:
-- authenticated super-admins cannot insert history (no insert policy).
--
-- Apply via the Supabase SQL editor, after 0154. Idempotent.

begin;

create or replace function public.bot_patch_roadmap_item(
  p_id uuid,
  p_from_status text,
  p_status text,
  p_preview_url text,
  p_released_on date,
  p_updated_at timestamptz,
  p_note text,
  p_log boolean
)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_title text;
  v_area text;
  v_status text;
  v_preview_url text;
  v_released_on date;
  v_at timestamptz := coalesce(p_updated_at, now());
begin
  update public.olb_roadmap_items
     set status = p_status,
         preview_url = p_preview_url,
         released_on = p_released_on,
         updated_at = v_at
   where id = p_id
     and deleted_at is null
     and status = p_from_status
  returning id, title, area, status, preview_url, released_on
    into v_id, v_title, v_area, v_status, v_preview_url, v_released_on;

  if not found then
    if exists (
      select 1 from public.olb_roadmap_items
       where id = p_id and deleted_at is null
    ) then
      raise exception 'conflict' using errcode = 'P0001';
    end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_log then
    insert into public.olb_roadmap_events (
      item_id, actor, from_status, to_status, note, created_at
    ) values (
      p_id,
      'bot',
      p_from_status,
      p_status,
      nullif(btrim(coalesce(p_note, '')), ''),
      v_at
    );
  end if;

  return json_build_object(
    'id', v_id,
    'title', v_title,
    'area', v_area,
    'status', v_status,
    'preview_url', v_preview_url,
    'released_on', v_released_on
  );
end;
$$;

comment on function public.bot_patch_roadmap_item(uuid, text, text, text, date, timestamptz, text, boolean) is
  'Bot PATCH: move a roadmap card and optionally log history in one transaction. Fails with conflict if status changed.';

revoke all on function public.bot_patch_roadmap_item(uuid, text, text, text, date, timestamptz, text, boolean)
  from public, anon, authenticated;
grant execute on function public.bot_patch_roadmap_item(uuid, text, text, text, date, timestamptz, text, boolean)
  to service_role;

commit;

notify pgrst, 'reload schema';
