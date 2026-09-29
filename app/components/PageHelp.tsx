"use client";
// Lets a page with views of its own under one address (Settings' tabs) tell
// the top-bar "i" which User Guide section the open view is, so the panel and
// its "Show me around" match what's on screen. PortalShell provides it.
import { createContext, useContext, useEffect } from "react";

export const PageHelpContext = createContext<(sectionId: string | null) => void>(() => {});

export function usePageHelp(sectionId: string | null) {
  const setSection = useContext(PageHelpContext);
  useEffect(() => {
    setSection(sectionId);
    return () => setSection(null);
  }, [setSection, sectionId]);
}
