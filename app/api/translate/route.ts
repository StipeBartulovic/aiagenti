import { errorPayload } from '@/lib/server/errors';
import { translateReport, type TranslateRequest } from '@/lib/server/translate';

export async function POST(request: Request) {
  try {
    const body: TranslateRequest = await request.json();
    return Response.json(await translateReport(body));
  } catch (err) {
    console.error('Translation error:', err);
    const { body, status } = errorPayload(err, 'Error translating');
    return Response.json(body, { status });
  }
}
