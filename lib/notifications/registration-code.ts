// Server-only. Emails the 6-digit code the public registration form asks
// for before it fills in a returning family's details (0103). Returns false
// when it can't send (no RESEND_API_KEY, or Resend refused), so the form
// carries on without it.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendRegistrationCode({ to, code }: { to: string; code: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping registration code email");
    return false;
  }
  // A blank MAIL_FROM counts as unset, as it does for the Contact form.
  const from = process.env.MAIL_FROM?.trim() || "Omaha Lightning Basketball <onboarding@resend.dev>";
  const body = `
    <p>Here's your code for Omaha Lightning Basketball registration:</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
    <p>Type it into the registration form. It works for 10 minutes.</p>
    <p style="color:#6b7280">Didn't ask for this? You can ignore this email. Nobody can see your family's details without the code.</p>
  `;
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${code} is your Omaha Lightning registration code`,
      html: body,
      text: `Your Omaha Lightning Basketball registration code is ${code}. It works for 10 minutes.`,
    }),
  }).catch(() => null);
  if (!res?.ok) {
    const text = res ? await res.text().catch(() => "") : "network error";
    console.error(`[notify] Resend registration code failed (${res?.status ?? "-"}) from "${from}": ${text.slice(0, 300)}`);
    return false;
  }
  return true;
}
