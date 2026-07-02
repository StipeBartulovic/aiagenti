import { ServerActionError } from './errors';

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

export interface TranslateRequest {
  report: unknown;
  targetLanguage: 'hr' | 'en';
}

export async function translateReport({ report, targetLanguage }: TranslateRequest): Promise<unknown> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new ServerActionError('DEEPSEEK_API_KEY nije postavljen.', 500, 'missing_api_key');
  }

  if (!report || !targetLanguage) {
    throw new ServerActionError('Nedostaju podaci.', 400, 'missing_data');
  }

  const prompt = `You are a translation assistant. Translate all the text fields of the following ValidationReport JSON object into ${targetLanguage === 'hr' ? 'Croatian' : 'English'} language.
    
    CRITICAL RULES:
    1. Keep all JSON keys exactly the same.
    2. Do NOT change any numbers, percentages, or statistics.
    3. Do NOT change the structure of the JSON.
    4. Only translate the text values of strings (such as summary, profile, assumption_vs_reality, top_reasons_to_buy, reasons, quotes, questions, product, marketing, pricing).
    5. Return ONLY the valid JSON object. No markdown, no triple backticks, no comments.
    
    JSON:
    ${JSON.stringify(report)}`;

  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a translation assistant. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new ServerActionError(`Translation failed: ${err}`, 500, 'translation_failed');
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new ServerActionError('Error translating', 500, 'translation_empty_response');
  }

  return JSON.parse(content);
}
