import { runEngine } from '@/lib/engine';
import type { IdeaFormData, ValidationReport } from '@/lib/types';
import { ServerActionError } from './errors';

async function extractTextFromUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
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
      new URL(targetUrl);
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
