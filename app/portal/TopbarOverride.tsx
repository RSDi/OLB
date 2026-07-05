"use client";
// Lets a page replace PortalShell's pathname-derived topbar label with
// something only the page knows (e.g. the archive channel page showing
// "Channel - #tech" instead of the generic "Channel"). PortalShell owns the
// state and provides just the setter; a page opts in by rendering
// <TopbarTitle title="..."> anywhere in its tree. The override clears on
// unmount, so navigating away falls back to PAGE_META automatically.

import { createContext, useContext, useEffect } from "react";

export type TopbarOverride = { title: string; subtitle?: string };

export const TopbarOverrideContext = createContext<(o: TopbarOverride | null) => void>(() => {});

export function TopbarTitle({ title, subtitle }: TopbarOverride) {
  const setOverride = useContext(TopbarOverrideContext);
  useEffect(() => {
    setOverride({ title, subtitle });
    return () => setOverride(null);
  }, [title, subtitle, setOverride]);
  return null;
}
