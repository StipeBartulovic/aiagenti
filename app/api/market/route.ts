import { marketAction, type MarketRequest } from '@/lib/server/market';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { errorPayload } from '@/lib/server/errors';

export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<MarketRequest>(request);
    return Response.json(await marketAction(body));
  } catch (err) {
    console.error('Market intelligence error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
