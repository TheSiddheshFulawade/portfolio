// Spec 003 V11-03 (REQ-COUNT-003, constitution 5.5): a visitor is identified only by
// SHA-256(dailySalt | ip), where dailySalt = HMAC-SHA256(secret, UTC day). The salt changes every day,
// so hashes from different days cannot be linked, and without the secret a hash cannot be recomputed from an IP.
// The user agent is deliberately not hashed (rotating it would mint new visitors), and an IPv6 address is cut
// to its /64 prefix (one subscriber holds a whole /64). Runs on Cloudflare Workers and in Node (Web Crypto in both).

const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The UTC calendar day, YYYY-MM-DD. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function dailySalt(secret: string, day: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(day)));
}

/**
 * The address a visitor is counted by: IPv4 as is (an IPv4-mapped IPv6 address counts as its IPv4), IPv6 expanded,
 * lowercased and cut to the first four groups (/64). Anything unparseable is used unchanged.
 */
export function visitorAddress(ip: string): string {
  const addr = ip.trim().toLowerCase().split('%')[0];
  if (!addr.includes(':')) return addr;
  const mapped =
    /^(?:0{0,4}:){2,5}(?:ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr) ??
    /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (mapped) return mapped[1];
  let text = addr;
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    if ([a, b, c, d].some((n) => n > 255)) return addr;
    text =
      text.slice(0, v4.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const halves = text.split('::');
  if (halves.length > 2) return addr;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return addr;
  const groups = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill('0'), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return addr;
  return groups
    .slice(0, 4)
    .map((g) => g.padStart(4, '0'))
    .join(':');
}

export async function visitorHash(secret: string, day: string, ip: string): Promise<string> {
  const salt = await dailySalt(secret, day);
  return hex(
    await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}|${visitorAddress(ip)}`)),
  );
}
