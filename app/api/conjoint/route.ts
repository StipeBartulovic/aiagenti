import { analyzeConjoint, type ConjointRequest } from '@/lib/server/conjoint';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { errorPayload } from '@/lib/server/errors';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<ConjointRequest>(request);
    return Response.json(await analyzeConjoint(body));
  } catch (err) {
    console.error('Conjoint error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
