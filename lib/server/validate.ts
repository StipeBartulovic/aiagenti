import { runEngine } from '@/lib/engine';
import type { IdeaFormData, ValidationReport } from '@/lib/types';
import { ServerActionError } from './errors';
import dns from 'node:dns/promises';
import net from 'node:net';

function isPrivateIpv4(host: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const parts = host.split('.').map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 0) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
    || normalized === '::';
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;

  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) return isPrivateIpv4(normalized);
  if (ipVersion === 6) return isPrivateIpv6(normalized);
  return false;
}

async function assertSafeExternalUrl(rawUrl: string): Promise<void> {
  const parsed = new URL(rawUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ServerActionError('Only http and https URLs are allowed.', 400, 'invalid_website_url');
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new ServerActionError('Private or local website URLs are not allowed.', 400, 'blocked_website_url');
  }

  try {
    const records = await dns.lookup(parsed.hostname, { all: true });
    if (records.some((record) => isBlockedHostname(record.address))) {
      throw new ServerActionError('Private or local website URLs are not allowed.', 400, 'blocked_website_url');
    }
  } catch (err) {
    if (err instanceof ServerActionError) throw err;
    throw new ServerActionError('Could not verify website URL.', 400, 'invalid_website_url');
  }
}

async function extractTextFromUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'error',
    });
    clearTimeout(id);

    if (!res.ok) return '';
    const html = await res.text();

    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();

    return text.slice(0, 4000);
  } catch (err) {
    console.error('Error fetching website context:', err);
    return '';
  }
}

export async function validateIdea(input: IdeaFormData): Promise<ValidationReport> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new ServerActionError(
      'AI engine is not configured. Missing DEEPSEEK_API_KEY.',
      500,
      'missing_api_key'
    );
  }

  const body: IdeaFormData = { ...input };

  if (!body.business_model || !body.product_name || !body.elevator_pitch || !body.price_model) {
    throw new ServerActionError('Missing required fields.', 400, 'missing_required_fields');
  }

  if (body.business_model === 'B2B2C') {
    if (!body.b2b2c_consumer_description || !body.b2b2c_business_description) {
      throw new ServerActionError('Missing B2B2C descriptions.', 400, 'missing_b2b2c_descriptions');
    }
  } else if (!body.detailed_description) {
    throw new ServerActionError('Missing detailed product description.', 400, 'missing_description');
  }

  if (body.website_url && body.website_url.trim() !== '') {
    let targetUrl = body.website_url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }
    try {
      await assertSafeExternalUrl(targetUrl);
      const extracted = await extractTextFromUrl(targetUrl);
      if (extracted) {
        body.website_context = extracted;
      }
    } catch (urlErr) {
      console.error('Invalid website URL:', targetUrl, urlErr);
    }
  }

  const depth = body.depth === 'deep' ? 'deep' : 'standard';
  return runEngine(body, depth, body.personas);
}
