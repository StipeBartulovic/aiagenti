import { suggestAudiences, type AudiencesRequest } from '@/lib/server/audiences';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    return Response.json(await suggestAudiences(await request.json() as AudiencesRequest));
  } catch (err) {
    console.error('Audiences error:', err);
    return Response.json({ segments: [] });
  }
}
