import { errorPayload } from '@/lib/server/errors';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { generateInterviewKit, type InterviewRequest } from '@/lib/server/interview';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<InterviewRequest>(request);
    return Response.json(await generateInterviewKit(body));
  } catch (err) {
    console.error('Interview error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
