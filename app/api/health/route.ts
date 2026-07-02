export const runtime = 'nodejs';

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  const checks = {
    deepseek: configured('DEEPSEEK_API_KEY'),
    tavily: configured('TAVILY_API_KEY'),
    upstashUrl: configured('UPSTASH_REDIS_REST_URL'),
    upstashToken: configured('UPSTASH_REDIS_REST_TOKEN'),
    desktopSharedSecret: configured('DESKTOP_AI_SHARED_SECRET'),
  };

  return Response.json({
    ok: checks.deepseek,
    checks,
    timestamp: new Date().toISOString(),
  });
}
