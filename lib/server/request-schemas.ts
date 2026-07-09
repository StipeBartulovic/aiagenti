import type { IdeaFormData, AgentId, ResearchAngle, GeoAreaSelection, DiscoveryAnswer, AdaptiveIntakeAnswer } from '@/lib/types';
import type { ChatRequest } from './chat';
import type { ResearchRequest } from './research';
import { ServerActionError } from './errors';
import { isServerActionCommand, type ServerActionCommand } from './actions';

const BUSINESS_MODELS = ['B2B', 'B2C', 'B2B2C'] as const;
const LANGUAGES = ['hr', 'en'] as const;
const VALIDATION_FOCUS = ['all', 'users', 'businesses'] as const;
const CHAT_INTENTS = ['open', 'reply', 'join'] as const;
const AGENT_IDS = ['tech', 'marketing', 'legal', 'business', 'sales', 'distribution'] as const satisfies readonly AgentId[];
const RESEARCH_ANGLES = ['competitors', 'pricing', 'voice_of_customer', 'demand', 'grants', 'funding', 'local_growth', 'custom'] as const satisfies readonly ResearchAngle[];
const DISCOVERY_CATEGORIES = ['buyer', 'pain', 'status_quo', 'wedge', 'proof', 'risk'] as const satisfies readonly DiscoveryAnswer['category'][];

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

function readSampleSize(obj: Record<string, unknown>): 50 | 100 | 200 | undefined {
  const value = obj.sample_size;
  if (value == null) return undefined;
  if (value !== 50 && value !== 100 && value !== 200) {
    throw new ServerActionError('Invalid field: sample_size.', 400, 'invalid_request_body');
  }
  return value;
}

function readSegmentSpecs(obj: Record<string, unknown>): IdeaFormData['segmentSpecs'] {
  const value = obj.segmentSpecs;
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw new ServerActionError('Invalid field: segmentSpecs.', 400, 'invalid_request_body');
  }

  return value.slice(0, 6).map((item, index) => {
    const segment = assertRecord(item);
    const label = typeof segment.label === 'string' && segment.label.trim()
      ? segment.label.trim().slice(0, 80)
      : `Segment ${index + 1}`;
    const description = typeof segment.description === 'string' ? segment.description.trim().slice(0, 240) : '';
    const rationale = typeof segment.rationale === 'string' ? segment.rationale.trim().slice(0, 320) : description;
    const roles = Array.isArray(segment.roles)
      ? segment.roles.filter((role): role is string => typeof role === 'string' && role.trim().length > 0).map((role) => role.trim().slice(0, 80)).slice(0, 8)
      : ['Customer'];
    const regions = Array.isArray(segment.regions)
      ? segment.regions.filter((region): region is string => typeof region === 'string' && region.trim().length > 0).map((region) => region.trim().slice(0, 80)).slice(0, 4)
      : ['Global'];
    const ageRange = Array.isArray(segment.age_range) ? segment.age_range : [];
    const techRange = Array.isArray(segment.tech_range) ? segment.tech_range : [];
    const ageMin = typeof ageRange[0] === 'number' ? Math.max(16, Math.min(80, Math.round(ageRange[0]))) : 25;
    const ageMax = typeof ageRange[1] === 'number' ? Math.max(16, Math.min(80, Math.round(ageRange[1]))) : 55;
    const techMin = typeof techRange[0] === 'number' ? Math.max(1, Math.min(10, Math.round(techRange[0]))) : 3;
    const techMax = typeof techRange[1] === 'number' ? Math.max(1, Math.min(10, Math.round(techRange[1]))) : 8;
    const incomeRaw = typeof segment.income_skew === 'string' ? segment.income_skew : 'mixed';
    const income_skew = (['low', 'medium', 'high', 'mixed'] as const).includes(incomeRaw as never)
      ? incomeRaw as 'low' | 'medium' | 'high' | 'mixed'
      : 'mixed';

    return {
      id: typeof segment.id === 'string' && segment.id.trim() ? segment.id.trim().slice(0, 40) : `custom-${index + 1}`,
      label,
      description,
      roles: roles.length ? roles : ['Customer'],
      age_range: [Math.min(ageMin, ageMax), Math.max(ageMin, ageMax)] as [number, number],
      regions: regions.length ? regions : ['Global'],
      income_skew,
      tech_range: [Math.min(techMin, techMax), Math.max(techMin, techMax)] as [number, number],
      rationale,
    };
  });
}

function readGeoArea(value: unknown): GeoAreaSelection | undefined {
  if (!isRecord(value)) return undefined;
  const label = typeof value.label === 'string' ? value.label.trim().slice(0, 200) : '';
  const center = isRecord(value.center) ? value.center : null;
  const bounds = isRecord(value.bounds) ? value.bounds : null;
  const lat = center && typeof center.lat === 'number' ? center.lat : null;
  const lng = center && typeof center.lng === 'number' ? center.lng : null;
  if (!label || lat == null || lng == null || !bounds) return undefined;

  const north = typeof bounds.north === 'number' ? bounds.north : null;
  const south = typeof bounds.south === 'number' ? bounds.south : null;
  const east = typeof bounds.east === 'number' ? bounds.east : null;
  const west = typeof bounds.west === 'number' ? bounds.west : null;
  if (north == null || south == null || east == null || west == null) return undefined;

  const points = Array.isArray(value.points)
    ? value.points
        .filter((p): p is { lat: number; lng: number } => isRecord(p) && typeof p.lat === 'number' && typeof p.lng === 'number')
        .slice(0, 200)
        .map((p) => ({ lat: p.lat, lng: p.lng }))
    : [];

  return { label, center: { lat, lng }, points, bounds: { north, south, east, west } };
}

function readGeoAreas(obj: Record<string, unknown>): GeoAreaSelection[] | undefined {
  const value = obj.geo_areas;
  if (!Array.isArray(value)) return undefined;
  const areas = value.slice(0, 5).map(readGeoArea).filter((a): a is GeoAreaSelection => Boolean(a));
  return areas.length ? areas : undefined;
}

function readDiscoveryAnswers(obj: Record<string, unknown>): DiscoveryAnswer[] | undefined {
  const value = obj.discovery_answers;
  if (!Array.isArray(value)) return undefined;
  const answers = value
    .filter(isRecord)
    .map((item) => {
      const question = typeof item.question === 'string' ? item.question.trim().slice(0, 300) : '';
      const answer = typeof item.answer === 'string' ? item.answer.trim().slice(0, 1000) : '';
      const category = (DISCOVERY_CATEGORIES as readonly string[]).includes(item.category as string)
        ? item.category as DiscoveryAnswer['category']
        : 'pain';
      return question ? { question, answer, category } : null;
    })
    .filter((item): item is DiscoveryAnswer => Boolean(item))
    .slice(0, 40);
  return answers.length ? answers : undefined;
}

function readAdaptiveAnswers(obj: Record<string, unknown>): AdaptiveIntakeAnswer[] | undefined {
  const value = obj.adaptive_answers;
  if (!Array.isArray(value)) return undefined;
  const answers = value
    .filter(isRecord)
    .map((item) => {
      const question = typeof item.question === 'string' ? item.question.trim().slice(0, 300) : '';
      const answer = typeof item.answer === 'string' ? item.answer.trim().slice(0, 1000) : '';
      const category = typeof item.category === 'string' ? item.category.trim().slice(0, 40) : '';
      return question ? { question, answer, category } : null;
    })
    .filter((item): item is AdaptiveIntakeAnswer => Boolean(item))
    .slice(0, 20);
  return answers.length ? answers : undefined;
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
  parsed.market_context = readOptionalString(body, 'market_context', 2600);
  parsed.b2b2c_consumer_description = readOptionalString(body, 'b2b2c_consumer_description', 3000);
  parsed.b2b2c_business_description = readOptionalString(body, 'b2b2c_business_description', 3000);
  parsed.initial_brief = readOptionalString(body, 'initial_brief', 2000);
  parsed.inferred_category = readOptionalString(body, 'inferred_category', 120);
  parsed.language = readEnum(body, 'language', LANGUAGES, false) as 'hr' | 'en' | undefined;
  parsed.depth = readEnum(body, 'depth', ['standard', 'deep'] as const, false) as 'standard' | 'deep' | undefined;
  parsed.sample_size = readSampleSize(body);
  parsed.validation_focus = readEnum(body, 'validation_focus', VALIDATION_FOCUS, false) as IdeaFormData['validation_focus'];
  parsed.segmentSpecs = readSegmentSpecs(body);
  parsed.geo_area = readGeoArea(body.geo_area);
  parsed.geo_areas = readGeoAreas(body);
  parsed.discovery_answers = readDiscoveryAnswers(body);
  parsed.adaptive_answers = readAdaptiveAnswers(body);

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
    marketCompetitorNames: readStringArray(body, 'marketCompetitorNames', 12, 120),
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
