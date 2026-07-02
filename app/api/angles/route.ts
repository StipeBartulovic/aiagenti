import { generateMarketingAngles, type AnglesRequest } from '@/lib/server/angles';
import { errorPayload } from '@/lib/server/errors';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body: AnglesRequest = await request.json();
    return Response.json(await generateMarketingAngles(body));
  } catch (err) {
    console.error('Angles error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
