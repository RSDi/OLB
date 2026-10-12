"use client";
// A crash on a portal page: the sidebar stays, and the reason shows.
import { ErrorDetails } from "../components/ErrorDetails";

export default function PortalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <ErrorDetails error={error} retry={unstable_retry} />;
}
