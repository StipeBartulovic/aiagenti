import { errorPayload } from '@/lib/server/errors';
import { buildObsidianVault, type ObsidianBuildRequest } from '@/lib/server/obsidian-build';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body: ObsidianBuildRequest = await request.json();
    return Response.json(await buildObsidianVault(body));
  } catch (err) {
    console.error('Obsidian build error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
