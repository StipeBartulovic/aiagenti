import { generateMarketingAngles, type AnglesRequest } from '@/lib/server/angles';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { errorPayload } from '@/lib/server/errors';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<AnglesRequest>(request);
    return Response.json(await generateMarketingAngles(body));
  } catch (err) {
    console.error('Angles error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
