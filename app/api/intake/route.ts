import { errorPayload } from '@/lib/server/errors';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { runIntake, type IntakeRequest } from '@/lib/server/intake';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<IntakeRequest>(request);
    return Response.json(await runIntake(body));
  } catch (err) {
    console.error('Intake error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
