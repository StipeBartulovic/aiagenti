import { errorPayload } from '@/lib/server/errors';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { buildSessionDigest, type SessionDigestRequest } from '@/lib/server/session-digest';

export const maxDuration = 45;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<SessionDigestRequest>(request);
    return Response.json(await buildSessionDigest(body));
  } catch (err) {
    console.error('Session digest error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
