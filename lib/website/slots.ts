// Every spot on the public site that Settings → Website can change, with the
// words or picture the page shows until someone does. Pages read a spot with
// getSiteContent() (./queries.ts); a spot nobody has edited shows its
// default, so a new spot changes nothing until it's edited.
//
// To make another spot editable: add it here, then read it on the page in
// place of the words or picture written there. Keep the default identical to
// what the page showed, so the page looks the same until it's edited.
// Safe to import from client components.

import type { StaticImageData } from "next/image";
import homeBasketball from "../../app/(site)/_images/home-basketball.jpg";
import philosophyNet from "../../app/(site)/_images/philosophy-net.jpg";
import historyNet from "../../app/(site)/_images/history-net.jpg";
import summerFlyer from "../../app/(site)/_images/summer-clinic-flyer.jpg";
import type { SlotKind } from "./content";

interface SlotBase {
  key: string;
  // Which page it's on, as the editor groups them.
  page: string;
  // What the spot is, in the editor.
  label: string;
  // A hint under the field.
  help?: string;
}

export interface TextSlot extends SlotBase {
  kind: "text";
  default: string;
  // Allow line breaks (a text box rather than a one-line field).
  multiline?: boolean;
  max: number;
}

export interface MarkdownSlot extends SlotBase {
  kind: "markdown";
  default: string;
}

export interface ImageSlot extends SlotBase {
  kind: "image";
  default: StaticImageData;
  defaultAlt: string;
}

export type SiteSlot = TextSlot | MarkdownSlot | ImageSlot;

export const SITE_SLOTS = [
  // ─── Home ───────────────────────────────────────────────────────────────
  {
    key: "home.welcome.title",
    page: "Home",
    label: "Welcome heading",
    kind: "text",
    max: 120,
    default: "Welcome to Omaha Lightning Basketball!",
  },
  {
    key: "home.welcome.body",
    page: "Home",
    label: "Welcome message",
    kind: "markdown",
    default:
      "For over two decades, Omaha Lightning Basketball has served to create an opportunity for home school athletes from all over the Omaha metro and surrounding areas to experience the challenge, enjoyment, and personal development opportunities that competitive basketball can offer. Most importantly though, our goal is to provide these experiences in a Christian environment where young boys have the opportunity to grow into Godly Christian men. To learn more about the Lightning philosophy click [HERE](/philosophy).",
  },
  {
    key: "home.photo",
    page: "Home",
    label: "Main photo",
    help: "Beside Purpose, Mission and Vision. Cropped to fit, so keep the subject near the middle.",
    kind: "image",
    default: homeBasketball,
    defaultAlt: "A basketball on the court at players' feet",
  },
  {
    key: "home.purpose",
    page: "Home",
    label: "Purpose",
    kind: "text",
    multiline: true,
    max: 1000,
    default:
      "Omaha Lightning Basketball exists to provide home educated boys the opportunity to participate in an organized competitive basketball program that has a distinctly Christian character.",
  },
  {
    key: "home.mission",
    page: "Home",
    label: "Mission",
    kind: "text",
    multiline: true,
    max: 1000,
    default:
      "Provide an enriching environment that challenges players to mature physically, emotionally, and spiritually, thereby growing in grace, and in the knowledge of our Lord and Savior Jesus Christ.",
  },
  {
    key: "home.vision",
    page: "Home",
    label: "Vision",
    kind: "text",
    multiline: true,
    max: 1000,
    default:
      "That students develop into mature Christian adults who serve their families, churches, and communities according to the ideals espoused in Colossians 3:17; “And whatever you do in word or deed, do all in the name of the Lord Jesus, giving thanks to God the Father through Him.”",
  },

  // ─── Philosophy ─────────────────────────────────────────────────────────
  {
    key: "philosophy.title",
    page: "Philosophy",
    label: "Heading",
    kind: "text",
    max: 80,
    default: "Philosophy.",
  },
  {
    key: "philosophy.banner",
    page: "Philosophy",
    label: "Banner picture",
    help: "Behind the heading, faded with a white wash and cropped to the banner's shape.",
    kind: "image",
    default: philosophyNet,
    defaultAlt: "",
  },
  {
    key: "philosophy.body",
    page: "Philosophy",
    label: "Page text",
    kind: "markdown",
    default: `For over two decades, Omaha Lightning Basketball has served to create an opportunity for home school athletes from all over the Omaha metro and surrounding areas to experience the challenge, enjoyment, and personal development opportunities that competitive basketball can offer. Most importantly though, our goal is to provide these experiences in a Christian environment where young boys have the opportunity to grow into Godly Christian men. To that end, Omaha Lightning Basketball is devoted to THREE GUIDING PRINCIPLES...

**-God-**

Above all else, we strive to use the experiences players encounter while practicing and playing the sport of basketball to teach our players Christ like character. We believe the situations players experience on the court emulate experiences they will face as they enter their adult lives. We seek to use these experiences as teaching tools to help players learn to respond in a way that glorifies Christ.

**-Family-**

Secondly, as players condition, practice, compete, win and lose together, we work to create a strong sense of community. Our goal is for players to build meaningful, positive relationships that will carry them through the challenges that occur during adolescent and teenage years. Through trial and victory, players learn and experience what it means to be a family and their responsibilities to that family.

**-Basketball-**

Lastly, we strive to provide a setting where home school students can achieve their full athletic potential. No matter the players skill level or previous basketball experiences, we set high expectation to continually improve. Through conditioning, practicing and game experiences, skilled coaches and the entire Omaha Lightning family encourage and help each player improve toward being the best athlete they can be.`,
  },

  // ─── History ────────────────────────────────────────────────────────────
  {
    key: "history.title",
    page: "History",
    label: "Heading",
    kind: "text",
    max: 80,
    default: "History.",
  },
  {
    key: "history.body",
    page: "History",
    label: "Page text",
    kind: "markdown",
    default: "The Lightning Story…\n\ncoming soon!",
  },
  {
    key: "history.background",
    page: "History",
    label: "Background picture",
    help: "Fills the page behind the text, faded with a white wash.",
    kind: "image",
    default: historyNet,
    defaultAlt: "",
  },

  // ─── Summer ─────────────────────────────────────────────────────────────
  {
    key: "summer.title",
    page: "Summer",
    label: "Heading",
    kind: "text",
    max: 80,
    default: "SUMMER 2026 CLINICS",
  },
  {
    key: "summer.status",
    page: "Summer",
    label: "Status line",
    help: "The red line under the heading, like WAITLISTED! or OPEN NOW!",
    kind: "text",
    max: 60,
    default: "WAITLISTED!",
  },
  {
    key: "summer.flyer",
    page: "Summer",
    label: "Flyer",
    help: "Shown whole, never cropped.",
    kind: "image",
    default: summerFlyer,
    defaultAlt:
      "Omaha Lightning's Summer Heat basketball clinics: 8 sessions for $60, July and August, ages 7-18, T-shirt included",
  },

  // ─── Footer (every page) ────────────────────────────────────────────────
  {
    key: "footer.verse",
    page: "Footer (every page)",
    label: "Verse",
    kind: "markdown",
    default: "*“And whatever you do, do it heartily, as to the Lord and not to men.”* Col 3:23",
  },
  {
    key: "footer.tagline",
    page: "Footer (every page)",
    label: "Tagline",
    kind: "text",
    max: 200,
    default: "A volunteer-run program that supports and advances homeschool sports in Omaha, Nebraska",
  },
] as const satisfies readonly SiteSlot[];

export type SlotKey = (typeof SITE_SLOTS)[number]["key"];
export type TextSlotKey = Extract<(typeof SITE_SLOTS)[number], { kind: "text" | "markdown" }>["key"];
export type ImageSlotKey = Extract<(typeof SITE_SLOTS)[number], { kind: "image" }>["key"];

const BY_KEY = new Map<string, SiteSlot>(SITE_SLOTS.map((s) => [s.key, s]));

export function findSlot(key: string): SiteSlot | null {
  return BY_KEY.get(key) ?? null;
}

export function slotKindOf(key: string): SlotKind | null {
  return BY_KEY.get(key)?.kind ?? null;
}
