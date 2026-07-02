import { errorPayload } from '@/lib/server/errors';
import { generateInterviewKit, type InterviewRequest } from '@/lib/server/interview';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body: InterviewRequest = await request.json();
    return Response.json(await generateInterviewKit(body));
  } catch (err) {
    console.error('Interview error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
