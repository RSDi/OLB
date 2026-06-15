// Gravatar avatar resolution (2026-06). A member's avatar is their explicit
// avatar_url if set, otherwise their Gravatar — derived from the email, no URL
// to paste. Gravatar keys off the MD5 of the trimmed, lowercased email:
//   https://www.gravatar.com/avatar/<md5>?s=<size>&d=mp
// `d=mp` ("mystery person") always returns an image, so this is safe to render
// directly (no broken-image / onError handling needed). MD5 is vendored below
// so this works in both server and client components (SubtleCrypto has no sync
// MD5, and Node's crypto can't be imported into the client bundle).

export interface AvatarMember {
  avatar_url?: string | null;
  email?: string | null;
}

// Resolve the avatar to show: explicit URL, else Gravatar (by email), else null
// (caller shows its icon fallback — only happens when there's no email).
export function resolveAvatarUrl(member: AvatarMember, size = 160): string | null {
  const explicit = member.avatar_url?.trim();
  // Honor an explicit avatar URL — UNLESS it's a Gravatar *profile* URL
  // (gravatar.com/<user>, not an /avatar/ image). People paste those meaning
  // "use my Gravatar", so fall through to the email-derived avatar image.
  if (explicit && !isGravatarProfileUrl(explicit)) return explicit;
  const email = member.email?.trim().toLowerCase();
  if (!email) return explicit ?? null;
  return `https://www.gravatar.com/avatar/${md5(email)}?s=${size}&d=mp`;
}

function isGravatarProfileUrl(url: string): boolean {
  return /(^|\.|\/)gravatar\.com\//i.test(url) && !/\/avatar\//i.test(url);
}

// ── Vendored MD5 (RFC 1321), UTF-8 aware. Compact + verified against
//    md5("myemailaddress@example.com") = 0bc83cb571cd1c50ba6f3e8a78ef1346.
function md5(input: string): string {
  const str = utf8(input);
  const x = toBlocks(str);
  const len = str.length * 8;
  x[len >> 5] |= 0x80 << len % 32;
  x[(((len + 64) >>> 9) << 4) + 14] = len;

  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < x.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
    a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222);
    c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = add(a, oa); b = add(b, ob); c = add(c, oc); d = add(d, od);
  }
  return hex(a) + hex(b) + hex(c) + hex(d);
}

function add(x: number, y: number): number {
  const l = (x & 0xffff) + (y & 0xffff);
  return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xffff);
}
function rol(n: number, c: number): number {
  return (n << c) | (n >>> (32 - c));
}
function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
  return add(rol(add(add(a, q), add(x, t)), s), b);
}
function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn((b & c) | (~b & d), a, b, x, s, t);
}
function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn((b & d) | (c & ~d), a, b, x, s, t);
}
function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn(b ^ c ^ d, a, b, x, s, t);
}
function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn(c ^ (b | ~d), a, b, x, s, t);
}
function toBlocks(str: string): number[] {
  const n = str.length;
  const blocks: number[] = [];
  for (let i = 0; i < n * 8; i += 8) {
    blocks[i >> 5] |= (str.charCodeAt(i / 8) & 0xff) << i % 32;
  }
  return blocks;
}
function hex(n: number): string {
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += h.charAt((n >> (i * 8 + 4)) & 0x0f) + h.charAt((n >> (i * 8)) & 0x0f);
  }
  return s;
}
// Encode to UTF-8 so non-ASCII emails hash like Gravatar expects.
function utf8(str: string): string {
  return unescape(encodeURIComponent(str));
}
