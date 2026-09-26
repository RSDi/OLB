import { Libre_Caslon_Display, Libre_Caslon_Text } from "next/font/google";

// The photo album's own voice: Caslon, a traditional book face, for the
// album title, the month-by-month timeline, and photo captions — the parts
// that should read like a printed keepsake rather than an admin screen.
// Controls, counts, and metadata stay in the portal's Inter. Defined once
// here (Next's font-definitions-file pattern) because the viewer renders in
// a portal outside the page's tree and has to apply the variables itself.
const albumDisplay = Libre_Caslon_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--album-display",
  display: "swap",
});

const albumText = Libre_Caslon_Text({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--album-text",
  display: "swap",
});

export const albumFontVariables = `${albumDisplay.variable} ${albumText.variable}`;
