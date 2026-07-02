import { advisorChatAction, type ChatRequest } from '@/lib/server/chat';
import { errorPayload } from '@/lib/server/errors';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json();
    return Response.json(await advisorChatAction(body));
  } catch (err) {
    console.error('Chat error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
