export class ServerActionError extends Error {
  constructor(message: string, public status = 500, public code?: string) {
    super(message);
    this.name = 'ServerActionError';
  }
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

  return {
    body: {
      error: error instanceof Error ? error.message : fallback,
    },
    status: 500,
  };
}
