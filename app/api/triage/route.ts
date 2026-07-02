import { triageAdvisorsAction, type TriageRequest } from '@/lib/server/triage';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body: TriageRequest = await request.json();
    return Response.json(await triageAdvisorsAction(body));
  } catch (err) {
    console.error('Triage error:', err);
    return Response.json({ suggestions: [] });
  }
}
