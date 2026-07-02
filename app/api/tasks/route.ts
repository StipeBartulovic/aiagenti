import { errorPayload } from '@/lib/server/errors';
import { createTaskFromConversation, type TaskRequest } from '@/lib/server/tasks';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body: TaskRequest = await request.json();
    return Response.json(await createTaskFromConversation(body));
  } catch (err) {
    console.error('Task extraction error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
