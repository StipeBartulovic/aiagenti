export class ServerActionError extends Error {
  constructor(message: string, public status = 500, public code?: string) {
    super(message);
    this.name = 'ServerActionError';
  }
}

function publicError(error: unknown, fallback: string): { error: string; status: number; code?: string } {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();

  if (normalized.includes('deepseek_api_key')) {
    return {
      error: 'AI engine is not configured. Missing DEEPSEEK_API_KEY.',
      status: 500,
      code: 'missing_api_key',
    };
  }

  if (normalized.includes('tavily_api_key')) {
    return {
      error: 'Research search is not configured. Missing TAVILY_API_KEY.',
      status: 500,
      code: 'missing_search_key',
    };
  }

  if (normalized.includes('deepseek error 401') || normalized.includes('deepseek error 403')) {
    return {
      error: 'AI provider rejected the API key. Check the production environment variables.',
      status: 502,
      code: 'ai_provider_auth_failed',
    };
  }

  if (normalized.includes('deepseek error 429') || normalized.includes('rate limit')) {
    return {
      error: 'AI provider is rate limited right now. Try again in a minute.',
      status: 429,
      code: 'ai_rate_limited',
    };
  }

  if (normalized.includes('deepseek error') || normalized.includes('tavily error')) {
    return {
      error: 'External AI service is temporarily unavailable. Try again shortly.',
      status: 502,
      code: 'external_ai_unavailable',
    };
  }

  if (normalized.includes('fetch failed') || normalized.includes('network')) {
    return {
      error: 'External service connection failed. Try again shortly.',
      status: 503,
      code: 'external_connection_failed',
    };
  }

  return {
    error: message || fallback,
    status: 500,
  };
}

export function errorPayload(error: unknown, fallback = 'Nepoznata greska') {
  if (error instanceof ServerActionError) {
    return {
      body: {
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      },
      status: error.status,
    };
  }

  const safe = publicError(error, fallback);
  return {
    body: {
      error: safe.error,
      ...(safe.code ? { code: safe.code } : {}),
    },
    status: safe.status,
  };
}
