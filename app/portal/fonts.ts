import { Barlow_Condensed } from "next/font/google";

// The Lightning theme's display face: a condensed, athletic sans for the
// sidebar wordmark, the top-bar section title, and big numbers (KPI tiles,
// event dates). Body text stays in Inter. Exposed as --rsd-font-display,
// which globals.css wraps into --rsd-display with fallbacks.
const portalDisplay = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--rsd-font-display",
  display: "swap",
});

export const portalFontVariables = portalDisplay.variable;
