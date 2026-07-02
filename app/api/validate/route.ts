import { errorPayload } from '@/lib/server/errors';
import { validateIdea } from '@/lib/server/validate';
import type { IdeaFormData } from '@/lib/types';

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body: IdeaFormData = await request.json();
    return Response.json(await validateIdea(body));
  } catch (err) {
    console.error('Engine error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
