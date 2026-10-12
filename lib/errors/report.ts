"use server";

// A crash in someone's browser, sent from the error pages so it shows up in
// the server's logs (Vercel) next to everything else. Nothing is stored.
export async function reportClientError(input: { message: string; stack: string; digest: string; url: string }): Promise<void> {
  const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
  console.error("[client-error]", JSON.stringify({ message: clip(input.message, 500), digest: clip(input.digest, 100), url: clip(input.url, 300), stack: clip(input.stack, 2000) }));
}
