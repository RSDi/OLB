// Scopes on olb_agent_keys (0149). Keys from 0146 have no column yet; the
// store treats a missing column as `{read}` so film GET still works.

export const AGENT_SCOPES = ["read", "email_archive:write"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const AGENT_SCOPE_LABELS: Record<AgentScope, string> = {
  read: "Read game film",
  "email_archive:write": "Import email archive",
};

export function isAgentScope(value: string): value is AgentScope {
  return (AGENT_SCOPES as readonly string[]).includes(value);
}

export function cleanAgentScopes(raw: unknown): { ok: true; scopes: AgentScope[] } | { ok: false; error: string } {
  const list = Array.isArray(raw) ? raw : raw == null ? ["read"] : null;
  if (!list) return { ok: false, error: "Pick what this key may do." };
  const scopes: AgentScope[] = [];
  for (const item of list) {
    if (typeof item !== "string" || !isAgentScope(item)) {
      return { ok: false, error: "That permission isn't one we issue." };
    }
    if (!scopes.includes(item)) scopes.push(item);
  }
  if (scopes.length === 0) return { ok: false, error: "Pick at least one permission." };
  return { ok: true, scopes };
}

export function keyHasScope(scopes: string[] | null | undefined, need: AgentScope): boolean {
  return Array.isArray(scopes) && scopes.includes(need);
}
