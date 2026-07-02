import { analyzeConjoint, type ConjointRequest } from '@/lib/server/conjoint';
import { errorPayload } from '@/lib/server/errors';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body: ConjointRequest = await request.json();
    return Response.json(await analyzeConjoint(body));
  } catch (err) {
    console.error('Conjoint error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
