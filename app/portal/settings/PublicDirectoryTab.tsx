"use client";
// Settings → Public Directory. Super-admins set the key in the public,
// read-only Directory's link (/directory/<key>, migration 0119): copy the
// link, type a key, make a new random one (retiring the old link) or turn the
// page off.
import { useEffect, useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill } from "../../components/ui";
import {
  loadPublicDirectorySetting,
  newPublicDirectoryKey,
  savePublicDirectoryKey,
  turnOffPublicDirectory,
  type PublicDirectorySetting,
} from "../../../lib/teams/public-directory-actions";
import { KEY_MAX, keyProblem } from "../../../lib/teams/public-directory-key";

export function PublicDirectoryTab() {
  const [setting, setSetting] = useState<PublicDirectorySetting | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadPublicDirectorySetting().then((res) => {
      if ("error" in res) setError(res.error);
      else {
        setSetting(res);
        setDraft(res.key ?? "");
      }
    });
  }, []);

  const key = setting?.key ?? null;
  // The tab only renders in the browser (Settings waits for the sign-in check).
  const link = key ? `${window.location.origin}/directory/${key}` : null;
  const draftProblem = draft.trim() && draft.trim() !== key ? keyProblem(draft.trim()) : null;

  async function run(action: () => Promise<{ key: string | null } | { error: string }>, done: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    const res = await action();
    setPending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setDraft(res.key ?? "");
    // Reload for who changed it and when.
    const fresh = await loadPublicDirectorySetting();
    setSetting("error" in fresh ? { key: res.key, updated_at: null, updated_by_name: null } : fresh);
    setCopied(false);
    setNotice(done);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
        A read-only Directory on the club website that opens without signing in. Only people with the link can see
        it. It lists families who said yes to the directory, shows each player&apos;s age and city (not birthday or
        street address), and never shows fees or payments. Change the key to retire a link that&apos;s been shared too widely.
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {setting && (
        <div className="rsd-card" style={{ padding: 18, gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>Link</div>
            {link ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <code
                  data-tour="public-directory-link"
                  style={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere", color: "var(--gw-fg)", flex: "1 1 280px" }}
                >
                  {link}
                </code>
                <Pill size="sm" variant="light" onClick={copy}>
                  {copied ? <Icons.Check width={13} height={13} /> : <Icons.Link width={13} height={13} />}
                  {copied ? "Copied" : "Copy link"}
                </Pill>
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="gw-press"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 100,
                    border: "1px solid var(--gw-border)",
                    background: "var(--gw-bg-elev)",
                    color: "var(--gw-fg)",
                    fontSize: 12,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  <Icons.ExternalLink width={13} height={13} /> Open
                </a>
              </div>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg)" }}>
                Off. Nobody can open the public Directory until you save a key.
              </div>
            )}
            {setting.updated_at && setting.updated_by_name && (
              <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
                Last changed by {setting.updated_by_name} on {new Date(setting.updated_at).toLocaleDateString()}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => savePublicDirectoryKey(draft), "Saved. The old link no longer works.");
            }}
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div data-tour="public-directory-key">
              <Input
                label="Key"
                help="The end of the link. At least 16 letters, numbers, dashes or underscores."
                value={draft}
                maxLength={KEY_MAX}
                onChange={(e) => setDraft(e.target.value)}
                error={draftProblem ?? undefined}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill
                size="sm"
                variant="accent"
                type="submit"
                disabled={pending || !draft.trim() || draft.trim() === key || !!draftProblem}
              >
                Save key
              </Pill>
              <span data-tour="public-directory-new" style={{ display: "inline-flex" }}>
                <Pill
                  size="sm"
                  variant="light"
                  disabled={pending}
                  onClick={() => {
                    if (key && !confirm("Make a new random key? The current link will stop working.")) return;
                    run(newPublicDirectoryKey, key ? "New link made. The old link no longer works." : "Link made.");
                  }}
                >
                  <Icons.Refresh width={13} height={13} /> New random key
                </Pill>
              </span>
              {key && (
                <Pill
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm("Turn off the public Directory? Every link to it will stop working.")) return;
                    run(turnOffPublicDirectory, "Turned off. Nobody can open the public Directory.");
                  }}
                >
                  Turn off
                </Pill>
              )}
            </div>
          </form>

          {notice && <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--gw-fg)" }}>{notice}</div>}
        </div>
      )}
    </div>
  );
}
