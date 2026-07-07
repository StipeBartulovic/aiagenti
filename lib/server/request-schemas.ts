import type { IdeaFormData, AgentId, ResearchAngle } from '@/lib/types';
import type { ChatRequest } from './chat';
import type { ResearchRequest } from './research';
import { ServerActionError } from './errors';
import { isServerActionCommand, type ServerActionCommand } from './actions';

const BUSINESS_MODELS = ['B2B', 'B2C', 'B2B2C'] as const;
const LANGUAGES = ['hr', 'en'] as const;
const CHAT_INTENTS = ['open', 'reply', 'join'] as const;
const AGENT_IDS = ['tech', 'marketing', 'legal', 'business', 'sales', 'distribution'] as const satisfies readonly AgentId[];
const RESEARCH_ANGLES = ['competitors', 'pricing', 'voice_of_customer', 'demand', 'grants', 'funding', 'local_growth', 'custom'] as const satisfies readonly ResearchAngle[];

interface DesktopAiRequest {
  command: ServerActionCommand;
  payload: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, code = 'invalid_request_body'): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ServerActionError('Request body must be a JSON object.', 400, code);
  }
  return value;
}

function readRequiredString(
  obj: Record<string, unknown>,
  key: string,
  maxLength: number,
  code = 'invalid_request_body'
): string {
  const value = obj[key];
  if (typeof value !== 'string') {
    throw new ServerActionError(`Invalid field: ${key}.`, 400, code);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ServerActionError(`Missing required field: ${key}.`, 400, code);
  }
  return trimmed.slice(0, maxLength);
}

function readOptionalString(obj: Record<string, unknown>, key: string, maxLength: number): string | undefined {
  const value = obj[key];
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new ServerActionError(`Invalid field: ${key}.`, 400, 'invalid_request_body');
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function readOptionalBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  const value = obj[key];
  if (value == null) return undefined;
  if (typeof value !== 'boolean') {
    throw new ServerActionError(`Invalid field: ${key}.`, 400, 'invalid_request_body');
  }
  return value;
}

function readEnum<T extends readonly string[]>(
  obj: Record<string, unknown>,
  key: string,
  allowed: T,
  required = true
): T[number] | undefined {
  const value = obj[key];
  if (value == null) {
    if (!required) return undefined;
    throw new ServerActionError(`Missing required field: ${key}.`, 400, 'invalid_request_body');
  }
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ServerActionError(`Invalid field: ${key}.`, 400, 'invalid_request_body');
  }
  return value as T[number];
}

function readStringArray(
  obj: Record<string, unknown>,
  key: string,
  maxItems: number,
  maxLength: number
): string[] {
  const value = obj[key];
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new ServerActionError(`Invalid field: ${key}.`, 400, 'invalid_request_body');
  }
  return value.slice(0, maxItems).map((item) => {
    if (typeof item !== 'string') {
      throw new ServerActionError(`Invalid field: ${key}.`, 400, 'invalid_request_body');
    }
    const trimmed = item.trim();
    if (!trimmed) {
      throw new ServerActionError(`Invalid field: ${key}.`, 400, 'invalid_request_body');
    }
    return trimmed.slice(0, maxLength);
  });
}

export function parseValidateRequest(raw: unknown): IdeaFormData {
  const body = assertRecord(raw);
  const businessModel = readEnum(body, 'business_model', BUSINESS_MODELS)!;

  const parsed: IdeaFormData = {
    business_model: businessModel,
    product_name: readRequiredString(body, 'product_name', 140),
    elevator_pitch: readRequiredString(body, 'elevator_pitch', 600),
    detailed_description: readOptionalString(body, 'detailed_description', 4000) || '',
    price_model: readRequiredString(body, 'price_model', 500),
  };

  parsed.target_market = readOptionalString(body, 'target_market', 300);
  parsed.assumed_customer = readOptionalString(body, 'assumed_customer', 400);
  parsed.competitors = readOptionalString(body, 'competitors', 500);
  parsed.website_url = readOptionalString(body, 'website_url', 500);
  parsed.website_context = readOptionalString(body, 'website_context', 4000);
  parsed.document_context = readOptionalString(body, 'document_context', 8000);
  parsed.b2b2c_consumer_description = readOptionalString(body, 'b2b2c_consumer_description', 3000);
  parsed.b2b2c_business_description = readOptionalString(body, 'b2b2c_business_description', 3000);
  parsed.initial_brief = readOptionalString(body, 'initial_brief', 2000);
  parsed.inferred_category = readOptionalString(body, 'inferred_category', 120);
  parsed.language = readEnum(body, 'language', LANGUAGES, false) as 'hr' | 'en' | undefined;
  parsed.depth = readEnum(body, 'depth', ['standard', 'deep'] as const, false) as 'standard' | 'deep' | undefined;

  if (businessModel === 'B2B2C') {
    if (!parsed.b2b2c_consumer_description || !parsed.b2b2c_business_description) {
      throw new ServerActionError('Missing B2B2C descriptions.', 400, 'invalid_request_body');
    }
  } else if (!parsed.detailed_description) {
    throw new ServerActionError('Missing detailed product description.', 400, 'invalid_request_body');
  }

  return parsed;
}

export function parseChatRequest(raw: unknown): ChatRequest {
  const body = assertRecord(raw);
  const transcriptRaw = body.transcript;
  const participantsRaw = body.participants;

  if (!Array.isArray(transcriptRaw) || !Array.isArray(participantsRaw)) {
    throw new ServerActionError('Invalid chat payload.', 400, 'invalid_request_body');
  }

  const transcript = transcriptRaw.slice(0, 80).map((item) => {
    const msg = assertRecord(item, 'invalid_request_body');
    const role = readEnum(msg, 'role', ['user', 'assistant'] as const)!;
    const content = readRequiredString(msg, 'content', 6000);
    const agentId = readEnum(msg, 'agentId', AGENT_IDS, false) as AgentId | undefined;
    return { role, content, agentId };
  });

  const participants = participantsRaw.slice(0, AGENT_IDS.length).map((item) => {
    if (typeof item !== 'string' || !AGENT_IDS.includes(item as AgentId)) {
      throw new ServerActionError('Invalid chat participants.', 400, 'invalid_request_body');
    }
    return item as AgentId;
  });

  return {
    targetAgentId: readEnum(body, 'targetAgentId', AGENT_IDS)!,
    context: readRequiredString(body, 'context', 20_000),
    transcript,
    language: readEnum(body, 'language', LANGUAGES)!,
    intent: readEnum(body, 'intent', CHAT_INTENTS)!,
    participants,
    deepMode: readOptionalBoolean(body, 'deepMode'),
  };
}

export function parseResearchRequest(raw: unknown): ResearchRequest {
  const body = assertRecord(raw);
  const parsed: ResearchRequest = {
    language: readEnum(body, 'language', LANGUAGES)!,
  };

  parsed.query = readOptionalString(body, 'query', 500);
  parsed.angle = readEnum(body, 'angle', RESEARCH_ANGLES, false) as ResearchAngle | undefined;

  if (body.idea != null) {
    parsed.idea = parseValidateRequest(body.idea);
  }

  if (!parsed.query && !parsed.idea?.product_name && !parsed.idea?.elevator_pitch) {
    throw new ServerActionError('Missing research query.', 400, 'invalid_request_body');
  }

  return parsed;
}

export function parseDesktopAiRequest(raw: unknown): DesktopAiRequest {
  const body = assertRecord(raw);
  const command = readRequiredString(body, 'command', 100);
  if (!isServerActionCommand(command)) {
    throw new ServerActionError('Unknown desktop AI command.', 400, 'unknown_desktop_ai_command');
  }

  const payload = body.payload;
  if (!(payload == null || isRecord(payload) || Array.isArray(payload))) {
    throw new ServerActionError('Invalid desktop AI payload.', 400, 'invalid_request_body');
  }

  return {
    command,
    payload: payload ?? {},
  };
}
