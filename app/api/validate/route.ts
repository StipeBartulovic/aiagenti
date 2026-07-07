import { errorPayload } from '@/lib/server/errors';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { parseValidateRequest } from '@/lib/server/request-schemas';
import { validateIdea } from '@/lib/server/validate';
import type { IdeaFormData } from '@/lib/types';

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = parseValidateRequest(await parseAndSanitizeJson<IdeaFormData>(request));
    return Response.json(await validateIdea(body));
  } catch (err) {
    console.error('Engine error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
