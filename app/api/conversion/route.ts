import { generateConversionPlan, type ConversionRequest } from '@/lib/server/conversion';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { errorPayload } from '@/lib/server/errors';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<ConversionRequest>(request);
    return Response.json(await generateConversionPlan(body));
  } catch (err) {
    console.error('Conversion error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
