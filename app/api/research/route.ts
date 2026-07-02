import { errorPayload } from '@/lib/server/errors';
import { runMarketResearch, type ResearchRequest } from '@/lib/server/research';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body: ResearchRequest = await request.json();
    return Response.json(await runMarketResearch(body));
  } catch (err) {
    console.error('Research error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
