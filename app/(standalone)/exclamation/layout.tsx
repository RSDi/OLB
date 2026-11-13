import { WebsiteBeacon } from "../../(site)/_components/WebsiteBeacon";

// The Coach Cory counter counts in Settings → Website Activity, like the club
// website's own pages.
export default function ExclamationLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <WebsiteBeacon />
    </>
  );
}
