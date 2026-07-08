import { pickNextDiscoveryQuestion, type DiscoveryNextRequest } from '@/lib/server/discovery';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { errorPayload } from '@/lib/server/errors';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<DiscoveryNextRequest>(request);
    return Response.json(await pickNextDiscoveryQuestion(body));
  } catch (err) {
    console.error('Discovery error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
