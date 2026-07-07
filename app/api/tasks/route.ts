import { errorPayload } from '@/lib/server/errors';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { createTaskFromConversation, type TaskRequest } from '@/lib/server/tasks';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<TaskRequest>(request);
    return Response.json(await createTaskFromConversation(body));
  } catch (err) {
    console.error('Task extraction error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
