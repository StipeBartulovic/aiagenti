import { errorPayload, ServerActionError } from '@/lib/server/errors';
import {
  chargeDesktopTokens,
  ensureDesktopTokens,
  readDesktopAccountId,
  verifyDesktopSecret,
} from '@/lib/server/desktop-billing';
import {
  isServerActionCommand,
  serverActionHandlers,
  type ServerActionCommand,
} from '@/lib/server/actions';

export const maxDuration = 300;
export const runtime = 'nodejs';

interface DesktopAiRequest {
  command: string;
  payload: unknown;
}

type DesktopActionHandler = (payload: unknown) => Promise<unknown>;

export async function POST(request: Request) {
  try {
    verifyDesktopSecret(request.headers);
    const accountId = readDesktopAccountId(request.headers);
    const body: DesktopAiRequest = await request.json();
    if (!body.command || !isServerActionCommand(body.command)) {
      throw new ServerActionError('Unknown desktop AI command.', 400, 'unknown_desktop_ai_command');
    }

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
