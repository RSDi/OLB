// Pages that stand on their own: only the root layout, so no public-site
// header, menu or footer and no portal sidebar. The public Directory lives
// here.
export default function StandaloneLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
