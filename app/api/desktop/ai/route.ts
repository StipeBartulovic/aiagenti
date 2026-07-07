import { errorPayload } from '@/lib/server/errors';
import { parseAndSanitizeJson } from '@/lib/server/api-guard';
import {
  chargeDesktopTokens,
  ensureDesktopTokens,
  readDesktopAccountId,
  verifyDesktopSecret,
} from '@/lib/server/desktop-billing';
import {
  serverActionHandlers,
  type ServerActionCommand,
} from '@/lib/server/actions';
import { parseDesktopAiRequest } from '@/lib/server/request-schemas';

export const maxDuration = 300;
export const runtime = 'nodejs';

type DesktopActionHandler = (payload: unknown) => Promise<unknown>;

export async function POST(request: Request) {
  try {
    verifyDesktopSecret(request.headers);
    const accountId = readDesktopAccountId(request.headers);
    const body = parseDesktopAiRequest(await parseAndSanitizeJson<Record<string, unknown>>(request));

    const command = body.command as ServerActionCommand;
    const reservation = await ensureDesktopTokens(accountId, command, body.payload);
    const handler = serverActionHandlers[command] as DesktopActionHandler;
    const result = await handler(body.payload);
    const charge = await chargeDesktopTokens(accountId, reservation.cost, command);
    return Response.json(result, {
      headers: {
        'x-ai-validator-token-cost': String(charge.charged),
        'x-ai-validator-token-balance': String(charge.balance),
      },
    });
  } catch (err) {
    console.error('Desktop AI bridge error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
