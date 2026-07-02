import { generateConversionPlan, type ConversionRequest } from '@/lib/server/conversion';
import { errorPayload } from '@/lib/server/errors';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body: ConversionRequest = await request.json();
    return Response.json(await generateConversionPlan(body));
  } catch (err) {
    console.error('Conversion error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
