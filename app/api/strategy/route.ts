import { errorPayload } from '@/lib/server/errors';
import { generateStrategyReview, type StrategyRequest } from '@/lib/server/strategy';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body: StrategyRequest = await request.json();
    return Response.json(await generateStrategyReview(body));
  } catch (err) {
    console.error('Strategy error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
