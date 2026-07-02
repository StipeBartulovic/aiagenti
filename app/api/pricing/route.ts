import { errorPayload } from '@/lib/server/errors';
import { analyzePricing, type PricingRequest } from '@/lib/server/pricing';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body: PricingRequest = await request.json();
    return Response.json(await analyzePricing(body));
  } catch (err) {
    console.error('Pricing error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
