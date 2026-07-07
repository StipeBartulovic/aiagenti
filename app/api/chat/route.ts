import { advisorChatAction, type ChatRequest } from '@/lib/server/chat';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { errorPayload } from '@/lib/server/errors';
import { parseChatRequest } from '@/lib/server/request-schemas';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = parseChatRequest(await parseAndSanitizeJson<ChatRequest>(request));
    return Response.json(await advisorChatAction(body));
  } catch (err) {
    console.error('Chat error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
