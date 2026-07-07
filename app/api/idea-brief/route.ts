import { generateIdeaBrief, type IdeaBriefRequest } from '@/lib/server/idea-brief';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { errorPayload } from '@/lib/server/errors';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<IdeaBriefRequest>(request);
    return Response.json(await generateIdeaBrief(body));
  } catch (err) {
    console.error('Idea brief error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
