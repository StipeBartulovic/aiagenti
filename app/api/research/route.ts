import { errorPayload } from '@/lib/server/errors';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { parseResearchRequest } from '@/lib/server/request-schemas';
import { runMarketResearch, type ResearchRequest } from '@/lib/server/research';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = parseResearchRequest(await parseAndSanitizeJson<ResearchRequest>(request));
    return Response.json(await runMarketResearch(body));
  } catch (err) {
    console.error('Research error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
