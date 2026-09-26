// Print-destined pages get only the root layout — no public-site header/footer
// (they'd end up on the printout) and no portal chrome. Pages in this group
// carry their own print CSS.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
