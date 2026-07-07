import { suggestAudiences, type AudiencesRequest } from '@/lib/server/audiences';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    return Response.json(await suggestAudiences(await parseAndSanitizeJson<AudiencesRequest>(request)));
  } catch (err) {
    console.error('Audiences error:', err);
    return Response.json({ segments: [] });
  }
}
