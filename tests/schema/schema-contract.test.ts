// Schema-contract smoke test (A10 / finding S14).
//
// Migrations are applied to Supabase by hand, so "code expects a column the
// database doesn't have" is this project's most likely failure mode — the
// pre-review public building form silently wrote to a table that never
// existed, failing every submission for weeks. This test enumerates every
// table+column the app reads or writes and probes the live schema with
// read-only selects. A 200 means the shape exists; anything else names
// exactly what's missing.
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (taken from the
// environment, falling back to .env.local). Without them — e.g. in CI, which
// has no secrets — every probe is skipped and only the unit tests run.
// Run before deploying after any migration: `npm run test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    try {
      const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
      const envFile = readFileSync(join(root, ".env.local"), "utf8");
      for (const line of envFile.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        if (m[1] === "NEXT_PUBLIC_SUPABASE_URL" && !url) url = m[2].trim();
        if (m[1] === "SUPABASE_SERVICE_ROLE_KEY" && !key) key = m[2].trim();
      }
    } catch {
      /* no .env.local — probes will skip */
    }
  }
  return url && key ? { url, key } : null;
}

const env = loadEnv();
const skip = env ? false : "no Supabase env — schema probes skipped (unit tests still ran)";

// Every table the app touches, with the columns its queries name. Add a line
// here whenever a migration adds a column the code starts using.
const CONTRACT: Record<string, string> = {
  members:
    "id,user_id,email,full_name,avatar_url,phone,birthday,role,status,requested_at,reviewed_at,reviewed_by,address,home_phone,nickname,anniversary,membership_status,directory_category,deceased_at,deleted_at,can_edit_settings,can_delete_settings,can_undelete_settings,access_revoked_at,volunteer_interests,can_manage_finances,can_manage_registrations,can_manage_travel,can_slack_dm,can_manage_website,access_profile_id,extra_permissions",
  access_profiles: "id,name,base_role,permissions,is_builtin",
  maintenance_requests:
    "id,description,status,review_status,decline_reason,decision_note,reviewed_at,reviewed_by,details,cost,created_at,updated_at,submitted_by,assigned_to,category_id,area_id,priority_id,project_id,slack_channel_id,slack_message_ts,event_id,occurrence_date,deleted_at,planning_template_id,planning_season",
  request_votes: "id,ticket_id,voter_id,vote,note,created_at,updated_at",
  task_review_log: "id,ticket_id,changed_by,old_status,new_status,reason,changed_at",
  ticket_comments: "id,ticket_id,author_id,body,parent_id,external_author,slack_ts,created_at,deleted_at",
  task_categories: "id,name,chip_class,sort_order,deleted_at",
  areas: "id,name,sort_order,deleted_at,responsible_team_id",
  priorities: "id,label,severity,chip_class,deleted_at",
  events: "id,title,description,start_at,end_at,location,area_id,category_id,source_ticket_id,shutdown_playbook_id,recurring,recur_weekdays,recur_until,recur_freq,recur_monthly_week,recur_monthly_weekday,recur_except,deleted_at",
  projects: "id,title,description,status,budget,category_id,created_by,deleted_at",
  supplies: "id,name,unit,on_hand,reorder_threshold,notes,reorder_contact_id,reorder_note,deleted_at",
  supply_usage: "id,supply_id,qty_used,used_by,pm_instance_asset_id,pm_instance_id,maintenance_request_id,notes",
  assets: "id,name,area_id,type,notes,deleted_at",
  asset_supplies: "asset_id,supply_id,qty_per_use,notes",
  pm_templates: "id,title,description,area_id,priority_id,schedule_kind,schedule_value,steps,asset_type,active,deleted_at",
  pm_instances: "id,template_id,title,status,scheduled_for,step_checks,notes,completed_at,completed_by,deleted_at",
  pm_instance_assets: "id,instance_id,asset_id,step_checks,notes,status,completed_at,completed_by",
  contacts:
    "id,kind,parent_contact_id,category_id,name,nickname,email,phone,mobile_phone,notes,tags,deleted_at,title,city,state,alt_email,team_colors,aliases",
  contact_links: "id,contact_id,entity_type,entity_id",
  contact_categories: "id,name,slug,sort_order,shared_with_coaches,travel_kind",
  contact_versions: "id,contact_id,action,changes,snapshot,source,changed_by,impersonator_user_id,changed_at",
  playbooks: "id,title,category_id,excerpt,body_md,created_by,updated_by,deleted_at,steps,wizard_slack_channel,wizard_completion_message",
  playbook_categories: "id,name,deleted_at",
  member_relationships: "id,member_id,related_member_id,relationship",
  volunteer_teams: "id,name,description,chip_class",
  member_volunteer_teams: "member_id,team_id,role,created_at",
  reel_notes_recordings:
    "id,user_id,title,audio_blob_url,duration_sec,source,status,assemblyai_id,transcript,utterances,summary,error,linked_entity_type,linked_entity_id,deleted_at",
  reel_notes_action_items:
    "id,recording_id,text,routed_to,done,sort_order,priority,owner_member_id,supporter_member_ids,suggested_assignee_name,suggested_member_id,suggested_supporter_names,transcript_ms,anchor_quote,task_id,dismissed",
  slack_archive_channels: "id,slack_channel_id,label,active,added_by,created_at,is_private,access_checked_at,access_error",
  slack_archive_channel_members: "channel_id,member_id,created_at",
  olb_boards: "id,season,name,parent_balances_visible",
  olb_teams: "id,board_id,name,age_group,color,grade_label,division,practice_times,target_size,min_size,max_size,sort_order,raw_header,updated_at",
  olb_players:
    "id,board_id,team_id,full_name,dob,grade,sort_order,import_flag,updated_at,age_group,new_to_program,address_line1,address_line2,city,state,postal_code,phone,email,registration_fee,payment_method,shirt_size,waiver_signed,waiver_signed_on,directory_optin,registered_at",
  olb_player_parents: "player_id,member_id,relationship",
  olb_coaches: "id,board_id,team_id,name,role,sort_order,updated_at",
  olb_registrations:
    "id,board_id,first_name,last_name,dob,grade,parent_name,parent_email,parent_phone,extra,status,player_id,reviewed_by,reviewed_at,created_at",
  olb_import_batches: "id,board_id,filename,summary",
  sidebar_links: "id,label,url,open_in_new_tab,open_in_frame,sort_order,created_by",
  olb_requirements:
    "id,name,description,kind,amount_cents,allow_file,due_on,team_ids,active,sort_order,created_by,created_at,updated_at,deleted_at",
  olb_player_requirements:
    "player_id,requirement_id,status,completed_on,note,file_path,file_name,marked_by,created_at,updated_at",
  olb_charges:
    "id,board_id,player_id,kind,category,description,amount_cents,entry_date,note,created_by,created_at,voided_at,voided_by",
  olb_payments:
    "id,board_id,group_id,player_id,amount_cents,paid_on,method,reference,note,recorded_by,created_at,voided_at,voided_by",
  // Emails (0116) and Slack DMs (0118) to families, and each Slack DM
  // sender's connection (0118).
  olb_player_messages: "id,player_id,subject,body,sent_to,sent_by,sent_at,via",
  member_slack_connections: "user_id,slack_user_id,slack_team_id,slack_name,access_token,scopes,connected_at",
  // The public Directory's link (0119).
  public_directory_link: "id,key,updated_by,updated_at",
  // Settings → Website (0120): the public site's menu and edited spots.
  site_menu_items: "id,parent_id,label,href,sort_order,updated_at,updated_by",
  site_content: "key,value,updated_at,updated_by",
  // Unpublished changes (0121).
  site_drafts: "key,value,updated_at,updated_by",
  // Activity page + "Preview as" (0099).
  member_audit_log: "id,member_id,changed_by,changed_at,action,old_data,new_data,impersonator_user_id",
  activity_events:
    "id,sid,user_id,user_name,role,event_type,path,impersonator_user_id,impersonator_sid,meta,created_at",
  member_previews:
    "id,secret_hash,impersonator_user_id,impersonator_sid,target_user_id,target_member_id,target_session_id,started_at,expires_at,ended_at,end_reason",
  activity_session_summary: "sid,user_id,started_at,last_event_at,page_views,is_preview,impersonator_user_id",
  activity_user_summary: "user_id,last_login_at,last_seen_at,sessions_30d,page_views_30d",
  activity_user_last_view: "user_id,last_seen_path",
  activity_top_pages_30d: "page,views,people",
  activity_daily_30d: "day,people,views",
  // Planning (0104).
  planning_roles: "id,name,chip_class,member_id,sort_order,seed_key,created_at,updated_at,deleted_at",
  planning_templates: "id,kind,title,notes,month,role_id,playbook_id,sort_order,seed_key,created_by,created_at,updated_at,deleted_at",
  planning_meetings: "id,month,meets_on,status,agenda_md,minutes_md,created_by,updated_by,created_at,updated_at,revision",
  planning_meeting_notes: "meeting_id,task_id,note_md,updated_by,created_at,updated_at,revision",
  // Meeting history (0105).
  planning_meeting_versions: "id,meeting_id,revision,meets_on,status,agenda_md,minutes_md,changed_by,changed_at",
  planning_meeting_note_versions: "id,meeting_id,task_id,note_md,changed_by,changed_at",
  // HS Schedule (0108).
  hs_seasons: "id,season,title,notes,imported_from,imported_at,created_by,created_at,updated_at",
  hs_levels: "id,season_id,label,name,team_id,hidden,sort_order,created_at,updated_at",
  hs_weekends:
    "id,season_id,starts_on,ends_on,event,details,location,trip,status,notes,facility_contact_id,sort_order,created_by,updated_by,created_at,updated_at",
  hs_weekend_games: "weekend_id,level_id,games,unsure,note,updated_by,updated_at",
  hs_opponents:
    "id,weekend_id,level_id,contact_id,name,status,our_score,their_score,note,sort_order,created_by,updated_by,created_at,updated_at",
};

async function probe(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${env!.url}/rest/v1/${path}`, {
    headers: { apikey: env!.key, Authorization: `Bearer ${env!.key}` },
  });
  return { status: res.status, body: await res.text() };
}

for (const [table, cols] of Object.entries(CONTRACT)) {
  test(`schema: ${table} has the columns the code uses`, { skip }, async () => {
    const { status, body } = await probe(`${table}?select=${cols}&limit=1`);
    assert.equal(status, 200, `${table}: ${body.slice(0, 200)}`);
  });
}

test("rpc: cast_request_vote exists (rejects non-staff)", { skip }, async () => {
  const res = await fetch(`${env!.url}/rest/v1/rpc/cast_request_vote`, {
    method: "POST",
    headers: {
      apikey: env!.key,
      Authorization: `Bearer ${env!.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_ticket_id: "00000000-0000-0000-0000-000000000000",
      p_vote: "yes",
    }),
  });
  const body = await res.text();
  // Service-role has no auth.uid() → is_staff() is false → the staff check
  // raises. PGRST202 would mean the function itself is missing.
  assert.ok(!body.includes("PGRST202"), `cast_request_vote missing: ${body.slice(0, 200)}`);
  assert.ok(body.includes("board"), `unexpected response: ${body.slice(0, 200)}`);
});

test("rpc: decrement_supply exists", { skip }, async () => {
  const res = await fetch(`${env!.url}/rest/v1/rpc/decrement_supply`, {
    method: "POST",
    headers: {
      apikey: env!.key,
      Authorization: `Bearer ${env!.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_supply_id: "00000000-0000-0000-0000-000000000000", p_qty: 0 }),
  });
  const body = await res.text();
  assert.ok(!body.includes("PGRST202"), `decrement_supply missing: ${body.slice(0, 200)}`);
});

test("rpc: my_permissions exists (0122)", { skip }, async () => {
  const res = await fetch(`${env!.url}/rest/v1/rpc/my_permissions`, {
    method: "POST",
    headers: {
      apikey: env!.key,
      Authorization: `Bearer ${env!.key}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(res.status, 200, await res.text().then((t) => t.slice(0, 200)));
});

test("rpc: search_global exists", { skip }, async () => {
  const res = await fetch(`${env!.url}/rest/v1/rpc/search_global`, {
    method: "POST",
    headers: {
      apikey: env!.key,
      Authorization: `Bearer ${env!.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: "zz-schema-probe", max_total: 1 }),
  });
  assert.equal(res.status, 200, await res.text().then((t) => t.slice(0, 200)));
});

// Migration 0093. The search box runs it next to search_global and just
// leaves the Slack group out if it's missing, so nothing else shows the gap.
test("rpc: archive_search_global exists", { skip }, async () => {
  const res = await fetch(`${env!.url}/rest/v1/rpc/archive_search_global`, {
    method: "POST",
    headers: {
      apikey: env!.key,
      Authorization: `Bearer ${env!.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_query: "zz-schema-probe", p_limit: 1 }),
  });
  assert.equal(res.status, 200, await res.text().then((t) => t.slice(0, 200)));
});
