import { errorPayload } from '@/lib/server/errors';
import { guardApiRoute, parseAndSanitizeJson } from '@/lib/server/api-guard';
import { translateReport, type TranslateRequest } from '@/lib/server/translate';

export async function POST(request: Request) {
  try {
    await guardApiRoute(request);
    const body = await parseAndSanitizeJson<TranslateRequest>(request);
    return Response.json(await translateReport(body));
  } catch (err) {
    console.error('Translation error:', err);
    const { body, status } = errorPayload(err, 'Error translating');
    return Response.json(body, { status });
  }
}
