import { errorPayload } from '@/lib/server/errors';
import { runIntake, type IntakeRequest } from '@/lib/server/intake';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body: IntakeRequest = await request.json();
    return Response.json(await runIntake(body));
  } catch (err) {
    console.error('Intake error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
