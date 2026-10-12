"use client";
// A crash outside every page (the layouts themselves): the reason shows,
// instead of Next.js's page with none.
import { ErrorDetails } from "./components/ErrorDetails";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <ErrorDetails error={error} />
      </body>
    </html>
  );
}
