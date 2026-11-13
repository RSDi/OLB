import { WebsiteBeacon } from "../../(site)/_components/WebsiteBeacon";

// Every Shootout page (the live scores, the TV screens, the scorer's tables
// and the signs) counts in Settings → Website Activity, like the club
// website's own pages. The TV pages turn screens without changing address, so
// a TV only adds a page view when it loads or reloads.
export default function ShootoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <WebsiteBeacon />
    </>
  );
}
