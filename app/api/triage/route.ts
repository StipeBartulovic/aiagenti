import { triageAdvisorsAction, type TriageRequest } from '@/lib/server/triage';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<TriageRequest>(request);
    return Response.json(await triageAdvisorsAction(body));
  } catch (err) {
    console.error('Triage error:', err);
    return Response.json({ suggestions: [] });
  }
}
