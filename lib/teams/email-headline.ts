// Shared h1 sizing for the registration receipt and assessment confirmation
// (and the Settings → Registration Emails preview, which renders that same
// HTML). Gmail iOS/Android strip <style>, so the size is inline from the
// character count. A max-width:600px rule repeats it for clients that keep
// styles. Short headlines stay large on desktop.

export const EMAIL_HEADLINE_MAX_PX = 32;
export const EMAIL_HEADLINE_MIN_PX = 22;
export const EMAIL_HEADLINE_FULL_CHARS = 24;
// Reach the 22px floor by 36 characters so "You're signed up for 14U
// assessment!" stays two lines on a 390px phone.
export const EMAIL_HEADLINE_MIN_CHARS = 36;
export const EMAIL_HEADLINE_CLASS = "olb-email-h1";

export function emailHeadlineFontSize(text: string): number {
  const n = text.length;
  if (n <= EMAIL_HEADLINE_FULL_CHARS) return EMAIL_HEADLINE_MAX_PX;
  const span = EMAIL_HEADLINE_MIN_CHARS - EMAIL_HEADLINE_FULL_CHARS;
  const drop = EMAIL_HEADLINE_MAX_PX - EMAIL_HEADLINE_MIN_PX;
  const size = EMAIL_HEADLINE_MAX_PX - ((n - EMAIL_HEADLINE_FULL_CHARS) * drop) / span;
  return Math.max(EMAIL_HEADLINE_MIN_PX, Math.round(size));
}

function lineHeight(sizePx: number): number {
  return sizePx >= 30 ? 1.15 : 1.2;
}

export function emailHeadlineInlineStyle(text: string): string {
  const size = emailHeadlineFontSize(text);
  return `margin:16px 0 8px;font-size:${size}px;line-height:${lineHeight(size)};font-weight:800;`;
}

export function emailHeadlineMediaCss(text: string): string {
  const size = emailHeadlineFontSize(text);
  return `@media (max-width:600px){.${EMAIL_HEADLINE_CLASS}{font-size:${size}px!important;line-height:1.25!important;}}`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function emailHeadlineHtml(text: string): string {
  return `<h1 class="${EMAIL_HEADLINE_CLASS}" style="${emailHeadlineInlineStyle(text)}">${esc(text)}</h1>`;
}
