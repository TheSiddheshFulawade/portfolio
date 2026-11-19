// Spec 003 V11-03: the /api/visits endpoint (REQ-COUNT-002, 005, 006), run by functions/api/visits.ts.
// POST (from the site's own origin) records a visit and returns the totals; GET only reads them.
// Errors are RFC 9457 problem details with no internals. Rate limiting is a Cloudflare WAF rule on /api/*.
import { utcDay, visitorHash } from './visitor-hash.ts';
import { readTotals, recordVisit, type D1Database } from './visit-store.ts';

export interface VisitsEnv {
  VISITS_DB: D1Database;
  /** Secret for the daily salt (Cloudflare Pages secret). Never committed. */
  VISIT_SALT: string;
}

const PROBLEM: Record<number, string> = {
  403: 'Forbidden',
  405: 'Method not allowed',
  503: 'Counter unavailable',
};

function problem(status: number, detail: string, headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ type: 'about:blank', title: PROBLEM[status], status, detail }),
    {
      status,
      headers: {
        'content-type': 'application/problem+json',
        'cache-control': 'no-store',
        ...headers,
      },
    },
  );
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function handleVisits(
  request: Request,
  env: VisitsEnv,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return problem(405, 'Use GET to read or POST to count.', { allow: 'GET, POST' });
  }
  const day = utcDay(now());
  try {
    if (request.method === 'GET') return json(await readTotals(env.VISITS_DB, day));

    // Only the site itself may count (production or a preview: the request's own origin).
    if (request.headers.get('origin') !== new URL(request.url).origin) {
      return problem(403, 'Visits are counted only from this site.');
    }
    if (!env.VISIT_SALT) return problem(503, 'The counter is not configured.');
    const hash = await visitorHash(
      env.VISIT_SALT,
      day,
      request.headers.get('cf-connecting-ip') ?? '',
      request.headers.get('user-agent') ?? '',
    );
    return json(await recordVisit(env.VISITS_DB, day, hash));
  } catch {
    // No logging: the error could carry request data, and the logs must hold no personal data.
    return problem(503, 'The counter is unavailable. Try again later.');
  }
}
