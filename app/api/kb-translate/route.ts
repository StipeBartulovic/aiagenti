import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { errorPayload } from '@/lib/server/errors';
import { translateKnowledgeForDisplay, type KnowledgeTranslateRequest } from '@/lib/server/knowledge-translate';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    return Response.json(await translateKnowledgeForDisplay(await parseAndSanitizeJson<KnowledgeTranslateRequest>(request)));
  } catch (err) {
    console.error('KB translate error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
