import { errorPayload } from '@/lib/server/errors';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { generateStrategyReview, type StrategyRequest } from '@/lib/server/strategy';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<StrategyRequest>(request);
    return Response.json(await generateStrategyReview(body));
  } catch (err) {
    console.error('Strategy error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
