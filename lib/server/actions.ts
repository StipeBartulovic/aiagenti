import { generateMarketingAngles } from './angles';
import { suggestAudiences } from './audiences';
import { advisorChatAction } from './chat';
import { generateConversionPlan } from './conversion';
import { analyzeConjoint } from './conjoint';
import { generateIdeaBrief } from './idea-brief';
import { runIntake } from './intake';
import { generateInterviewKit } from './interview';
import { translateKnowledgeForDisplay } from './knowledge-translate';
import { updateKnowledgeAction } from './knowledge-update';
import { buildObsidianVault } from './obsidian-build';
import { analyzePricing } from './pricing';
import { runMarketResearch } from './research';
import { generateStrategyReview } from './strategy';
import { createTaskFromConversation } from './tasks';
import { translateReport } from './translate';
import { triageAdvisorsAction } from './triage';
import { validateIdea } from './validate';

export const serverActionHandlers = {
  ai_angles: generateMarketingAngles,
  ai_audiences: suggestAudiences,
  ai_chat: advisorChatAction,
  ai_conversion: generateConversionPlan,
  ai_conjoint: analyzeConjoint,
  ai_idea_brief: generateIdeaBrief,
  ai_intake: runIntake,
  ai_interview: generateInterviewKit,
  ai_kb_translate: translateKnowledgeForDisplay,
  ai_kb_update: updateKnowledgeAction,
  ai_obsidian_build: buildObsidianVault,
  ai_pricing: analyzePricing,
  ai_research: runMarketResearch,
  ai_strategy: generateStrategyReview,
  ai_tasks: createTaskFromConversation,
  ai_translate: translateReport,
  ai_triage: triageAdvisorsAction,
  ai_validate: validateIdea,
} as const;

export type ServerActionCommand = keyof typeof serverActionHandlers;

export function isServerActionCommand(command: string): command is ServerActionCommand {
  return command in serverActionHandlers;
}
