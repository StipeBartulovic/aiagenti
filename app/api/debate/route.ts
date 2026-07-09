import { errorPayload } from '@/lib/server/errors';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { runAdvisorDebate, type DebateRequest } from '@/lib/server/debate';

export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<DebateRequest>(request);
    return Response.json(await runAdvisorDebate(body));
  } catch (err) {
    console.error('Debate error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
