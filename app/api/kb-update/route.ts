import { errorPayload } from '@/lib/server/errors';
import { updateKnowledgeAction, type KnowledgeUpdateRequest } from '@/lib/server/knowledge-update';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    return Response.json(await updateKnowledgeAction(await request.json() as KnowledgeUpdateRequest));
  } catch (err) {
    console.error('KB update error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
