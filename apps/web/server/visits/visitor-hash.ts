// Spec 003 V11-03 (REQ-COUNT-003, constitution 5.5): a visitor is identified only by
// SHA-256(dailySalt | ip | userAgent), where dailySalt = HMAC-SHA256(secret, UTC day). The salt changes every day,
// so hashes from different days cannot be linked, and without the secret a hash cannot be recomputed from an IP.
// Runs on Cloudflare Workers and in Node (Web Crypto in both).

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

export async function visitorHash(
  secret: string,
  day: string,
  ip: string,
  userAgent: string,
): Promise<string> {
  const salt = await dailySalt(secret, day);
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}|${ip}|${userAgent}`)));
}
