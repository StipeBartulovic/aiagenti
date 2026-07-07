import {
  addDesktopWalletTokens,
  getDesktopWallet,
  readDesktopAccountId,
  verifyDesktopSecret,
} from '@/lib/server/desktop-billing';
import { parseAndSanitizeJson } from '@/lib/server/api-guard';
import { errorPayload } from '@/lib/server/errors';

export const runtime = 'nodejs';

interface WalletRequest {
  action?: 'balance' | 'top_up';
  euros?: number;
}

export async function POST(request: Request) {
  try {
    verifyDesktopSecret(request.headers);
    const accountId = readDesktopAccountId(request.headers);
    const body = await parseAndSanitizeJson<WalletRequest>(request);
    if (body.action === 'top_up') {
      return Response.json(await addDesktopWalletTokens(accountId, Number(body.euros ?? 0)));
    }
    return Response.json(await getDesktopWallet(accountId));
  } catch (err) {
    console.error('Desktop wallet error:', err);
    const { body, status } = errorPayload(err);
    return Response.json(body, { status });
  }
}
