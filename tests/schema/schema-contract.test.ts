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
    "id,user_id,email,full_name,avatar_url,phone,birthday,role,status,requested_at,reviewed_at,reviewed_by,address,home_phone,nickname,anniversary,membership_status,directory_category,deceased_at,deleted_at,can_edit_settings,can_delete_settings,can_undelete_settings,access_revoked_at,volunteer_interests",
  maintenance_requests:
    "id,description,status,review_status,decline_reason,decision_note,reviewed_at,reviewed_by,details,cost,created_at,updated_at,submitted_by,assigned_to,category_id,area_id,priority_id,project_id,slack_channel_id,slack_message_ts,event_id,occurrence_date,deleted_at",
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
  contacts: "id,name,phone,email,deleted_at",
  contact_links: "id,contact_id,entity_type,entity_id",
  contact_categories: "id,name,slug,sort_order",
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
  olb_boards: "id,season,name",
  olb_teams: "id,board_id,name,age_group,color,grade_label,division,practice_times,target_size,min_size,max_size,sort_order,raw_header,updated_at",
  olb_players:
    "id,board_id,team_id,full_name,dob,grade,sort_order,import_flag,updated_at,age_group,new_to_program,address_line1,address_line2,city,state,postal_code,phone,email,registration_fee,payment_method,shirt_size,waiver_signed,waiver_signed_on,directory_optin,registered_at",
  olb_player_parents: "player_id,member_id,relationship",
  olb_coaches: "id,board_id,team_id,name,role,sort_order,updated_at",
  olb_registrations:
    "id,board_id,first_name,last_name,dob,grade,parent_name,parent_email,parent_phone,extra,status,player_id,reviewed_by,reviewed_at,created_at",
  olb_import_batches: "id,board_id,filename,summary",
  sidebar_links: "id,label,url,open_in_new_tab,sort_order,created_by",
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
  assert.ok(body.includes("committee"), `unexpected response: ${body.slice(0, 200)}`);
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
