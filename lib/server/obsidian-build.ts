import { callDeepSeek } from '@/lib/deepseek';
import { buildVaultNotes, safeName } from '@/lib/obsidian-notes';
import type {
  IdeaFormData,
  MarketIntelligence,
  ObsidianNote,
  ProjectKnowledge,
  ValidationReport,
} from '@/lib/types';
import { ServerActionError } from './errors';

export interface ObsidianBuildRequest {
  idea: IdeaFormData;
  report: ValidationReport;
  knowledge?: ProjectKnowledge | null;
  market?: MarketIntelligence | null;
  language: 'hr' | 'en';
}

export interface ObsidianBuildResponse {
  notes: ObsidianNote[];
  project: string;
  count: number;
}

export async function buildObsidianVault(body: ObsidianBuildRequest): Promise<ObsidianBuildResponse> {
  if (!body.idea || !body.report) {
    throw new ServerActionError('Nedostaje idea ili report.', 400, 'missing_idea_or_report');
  }

  const notes: ObsidianNote[] = buildVaultNotes(
    body.idea,
    body.report,
    body.knowledge ?? null,
    body.language,
    body.market ?? null
  );

  const project = safeName(body.report.meta.product_name || body.idea.product_name);

  try {
    const childTitles = notes
      .slice(1)
      .map((n) => n.path.split('/').pop()!.replace(/\.md$/, ''));
    const langName = body.language === 'en' ? 'English' : 'Croatian';

    const prompt = `You are "Arhivar", a knowledge librarian organizing a startup validation into an Obsidian note.

PROJECT: ${project}
SCORE: ${body.report.score}/100 (buy ${body.report.intent.buy}% / maybe ${body.report.intent.maybe}% / reject ${body.report.intent.reject}%)
SUMMARY: ${body.report.summary}
TOP REJECTIONS: ${body.report.rejection.reasons.map((r) => `${r.reason} (${r.percentage}%)`).join('; ')}
ACTION PLAN: product=${body.report.action_plan.product} | marketing=${body.report.action_plan.marketing} | pricing=${body.report.action_plan.pricing}

Existing notes you can link to with [[wikilinks]] (use these EXACT titles):
${childTitles.map((t) => `- ${t}`).join('\n')}

Write the BODY (markdown, no frontmatter, no H1) of a "Key takeaways" note in ${langName}:
- 3-6 sharp, decision-oriented takeaways (what this means + what to do next)
- Reference relevant notes inline as [[exact title]] where it helps navigation
- Be concrete, no fluff. End with the single most important next step.`;

    const bodyMd = await callDeepSeek(
      [
        { role: 'system', content: 'You write concise, linked Obsidian notes. Return markdown only.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.4, maxTokens: 700 }
    );

    const label = body.language === 'en' ? 'Key takeaways' : 'Ključni zaključci';
    const title = `${project} — ${label}`;
    notes.push({
      path: `AI Validator/${project}/${safeName(title)}.md`,
      markdown: `---
tags: [ai-validator, zakljucci]
project: ${project}
source: AI Validator
---

> ${body.language === 'en' ? 'Part of project' : 'Dio projekta'} [[${project}]]

# ${label}

${bodyMd.trim()}
`,
    });

    notes[0].markdown = notes[0].markdown.replace(
      /(\n## .+\n)/,
      `$1- [[${title}]]\n`
    );
  } catch (e) {
    console.error('Arhivar synthesis skipped:', e);
  }

  return { notes, project, count: notes.length };
}
