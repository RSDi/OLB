"use client";
// Who else has this board meeting open, and when one of them saves, over a
// Supabase Realtime channel just for this meeting (planning-meeting:YYYY-MM).
// It's private: migration 0105 lets only the board join. If Realtime isn't
// reachable the page simply works without it; saves still merge safely.

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "../../../../../lib/supabase/client";
import type { MonthKey } from "../../../../../lib/planning/season";

export interface MeetingPeer {
  userId: string;
  name: string;
  editing: boolean;
}

export interface OtherSave {
  name: string;
  at: number;
}

export function useMeetingPresence(
  month: MonthKey,
  me: { userId: string; name: string },
  editing: boolean,
) {
  const [peers, setPeers] = useState<MeetingPeer[]>([]);
  const [otherSave, setOtherSave] = useState<OtherSave | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const joined = useRef(false);
  const editingRef = useRef(editing);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    (async () => {
      try {
        await supabase.realtime.setAuth();
        if (cancelled) return;
        channel = supabase.channel(`planning-meeting:${month}`, {
          config: { private: true, presence: { key: me.userId } },
        });
        channelRef.current = channel;
        channel
          .on("presence", { event: "sync" }, () => {
            const state = channel!.presenceState<{ name: string; editing: boolean }>();
            const others: MeetingPeer[] = [];
            for (const [userId, metas] of Object.entries(state)) {
              if (userId === me.userId || metas.length === 0) continue;
              others.push({ userId, name: metas[0].name, editing: metas.some((m) => m.editing) });
            }
            others.sort((a, b) => a.name.localeCompare(b.name));
            setPeers(others);
          })
          .on("broadcast", { event: "saved" }, ({ payload }) => {
            const p = payload as { userId?: string; name?: string };
            if (p.userId && p.userId !== me.userId) setOtherSave({ name: p.name ?? "Someone", at: Date.now() });
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              joined.current = true;
              channel!.track({ name: me.name, editing: editingRef.current }).catch(() => {});
            }
          });
      } catch {
        // No Realtime: no presence. Everything else still works.
      }
    })();
    return () => {
      cancelled = true;
      joined.current = false;
      channelRef.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [month, me.userId, me.name]);

  // Tell the others whether this person has unsaved changes.
  useEffect(() => {
    editingRef.current = editing;
    if (joined.current) channelRef.current?.track({ name: me.name, editing }).catch(() => {});
  }, [editing, me.name]);

  const announceSave = useCallback(() => {
    channelRef.current
      ?.send({ type: "broadcast", event: "saved", payload: { userId: me.userId, name: me.name } })
      .catch(() => {});
  }, [me.userId, me.name]);

  const clearOtherSave = useCallback(() => setOtherSave(null), []);

  return { peers, otherSave, announceSave, clearOtherSave };
}
