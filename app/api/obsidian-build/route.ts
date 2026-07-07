import { errorPayload } from '@/lib/server/errors';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { buildObsidianVault, type ObsidianBuildRequest } from '@/lib/server/obsidian-build';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<ObsidianBuildRequest>(request);
    return Response.json(await buildObsidianVault(body));
  } catch (err) {
    console.error('Obsidian build error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
