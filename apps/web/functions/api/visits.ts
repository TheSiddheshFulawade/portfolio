// Cloudflare Pages Function for /api/visits (spec 003 V11-03). The logic and its tests live in server/visits/.
import { handleVisits, type VisitsEnv } from '../../server/visits/handler.ts';

export const onRequest = (context: { request: Request; env: VisitsEnv }): Promise<Response> =>
  handleVisits(context.request, context.env);
