// The public site's navigation and outbound links, shared by the header,
// footer and pages.

export const FACEBOOK_URL = "https://www.facebook.com/omahalightningbb";
export const INSTAGRAM_URL = "https://www.instagram.com/omahalightning/";
export const PLAYER_HANDBOOK_URL =
  "https://drive.google.com/file/d/124S_qN47dtCvRyezXGfx8EcA-7C5W2Ke/view?usp=sharing";

export type NavLink = { label: string; href: string; external?: boolean };
export type NavFolder = { label: string; children: NavLink[] };
export type NavItem = NavLink | NavFolder;

export const NAV: NavItem[] = [
  {
    label: "About",
    children: [
      { label: "Philosophy", href: "/philosophy" },
      { label: "History", href: "/history" },
    ],
  },
  {
    label: "Programs",
    children: [
      { label: "SUMMER 2026", href: "/summer" },
      { label: "2026-27 Season", href: "/programs" },
    ],
  },
  { label: "Coaches", href: "/coaches" },
  { label: "Sponsors", href: "/sponsors" },
  {
    label: "Resources",
    children: [{ label: "Player Handbook", href: PLAYER_HANDBOOK_URL, external: true }],
  },
];

export function isFolder(item: NavItem): item is NavFolder {
  return "children" in item;
}
