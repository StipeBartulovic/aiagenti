import type { PersonaAttributes, SegmentSpec } from './types';

const B2B_ROLES = [
  'CEO & Founder', 'CTO', 'VP of Sales', 'HR Director', 'Chief Financial Officer',
  'Operations Manager', 'Small Business Owner', 'IT Manager', 'Procurement Specialist',
  'Marketing Director', 'Product Manager', 'Customer Success Manager', 'Founder & Partner',
  'Office Administrator', 'Technical Team Lead', 'Legal Counsel', 'Strategic Planner',
  'Operations Director', 'Sales Executive', 'Managing Director'
];

const B2C_ROLES = [
  'High School Teacher', 'Registered Nurse', 'University Student', 'Graphic Designer',
  'Software Engineer', 'Retail Sales Associate', 'Freelance Writer', 'Digital Marketer',
  'Doctor / Physician', 'Accountant', 'Construction Supervisor', 'High School Student',
  'Content Creator', 'Chef / Restaurant Owner', 'Fitness Coach', 'Stay-at-home Parent',
  'Retired Teacher', 'Real Estate Agent', 'Photographer', 'Customer Service Representative'
];

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Retail',
  'Manufacturing', 'Marketing & Advertising', 'Legal', 'Consulting',
  'Media & Entertainment', 'Non-profit', 'E-commerce',
];

const REGIONS = [
  'Western Europe', 'Eastern Europe', 'North America', 'Southeast Asia',
  'United Kingdom', 'Nordics', 'Southern Europe', 'DACH region',
];

const PERSONALITIES = ['enthusiast', 'pragmatist', 'cynic'] as const;
const INCOMES = ['low', 'medium', 'high'] as const;
type BuyerType = 'early_adopter' | 'mainstream' | 'skeptic';

type PersonaBankKey =
  | 'startup_saas'
  | 'fintech'
  | 'local_service'
  | 'retail'
  | 'marketplace'
  | 'physical_product'
  | 'generic';

interface PersonaBankProfile {
  roles: string[];
  industries: string[];
  regions?: string[];
  techBias: number;
  incomeBias?: typeof INCOMES[number];
  needs: string[];
  triggers: string[];
  barriers: string[];
  alternatives: string[];
  evidence: string[];
}

const PERSONA_BANKS: Record<PersonaBankKey, PersonaBankProfile> = {
  startup_saas: {
    roles: [
      'Startup Founder', 'Product Manager', 'Operations Lead', 'Growth Marketer',
      'Customer Success Manager', 'CTO', 'RevOps Manager', 'Agency Owner',
      'Freelance Consultant', 'Small Business Owner',
    ],
    industries: ['Technology', 'SaaS', 'Consulting', 'E-commerce', 'Marketing & Advertising'],
    regions: ['Western Europe', 'North America', 'DACH region', 'United Kingdom', 'Nordics'],
    techBias: 2,
    incomeBias: 'high',
    needs: ['faster growth', 'clearer prioritization', 'less manual ops', 'funding readiness', 'credible market proof'],
    triggers: ['runway pressure', 'upcoming investor conversation', 'slow activation', 'unclear ICP', 'need to prove traction'],
    barriers: ['too many tools already', 'unclear ROI', 'founder time scarcity', 'skepticism toward generic AI advice'],
    alternatives: ['spreadsheets', 'Notion docs', 'mentor calls', 'customer interviews', 'agency advice'],
    evidence: ['case studies', 'real customer proof', 'benchmarks', 'clear experiment plan', 'investor-ready outputs'],
  },
  fintech: {
    roles: [
      'Finance Manager', 'CFO', 'Accountant', 'Small Business Owner',
      'Compliance Officer', 'Banking Product Manager', 'Freelancer',
      'Operations Manager', 'Procurement Specialist', 'Startup Founder',
    ],
    industries: ['Finance', 'Banking', 'Accounting', 'Technology', 'Consulting'],
    regions: ['Western Europe', 'DACH region', 'United Kingdom', 'North America', 'Southern Europe'],
    techBias: 1,
    incomeBias: 'high',
    needs: ['trustworthy compliance', 'lower financial risk', 'audit-ready data', 'clear payment flow', 'strong security'],
    triggers: ['new regulation pressure', 'manual finance process breaking', 'fraud concern', 'cash-flow pain', 'board scrutiny'],
    barriers: ['security review', 'regulatory uncertainty', 'switching cost', 'procurement delay', 'fear of financial mistakes'],
    alternatives: ['bank portal', 'accounting software', 'Excel sheets', 'payment provider dashboard', 'manual accountant workflow'],
    evidence: ['security documentation', 'compliance proof', 'references from finance teams', 'clear liability terms', 'ROI model'],
  },
  local_service: {
    roles: [
      'Homeowner', 'Apartment Owner', 'Facility Manager', 'Small Business Owner',
      'Property Manager', 'Restaurant Owner', 'Hotel Manager', 'Office Administrator',
      'Construction Supervisor', 'Local Shop Owner',
    ],
    industries: ['Construction', 'Real Estate', 'Hospitality', 'Retail', 'Local Services'],
    regions: ['Croatia', 'Zagreb', 'Southern Europe', 'Eastern Europe', 'Local urban area'],
    techBias: -1,
    incomeBias: 'medium',
    needs: ['more local leads', 'better scheduling', 'trust from nearby customers', 'less admin work', 'repeat business'],
    triggers: ['seasonal demand drop', 'need to expand to another area', 'too many missed calls', 'bad online visibility', 'competitor nearby'],
    barriers: ['low digital patience', 'fear of wasted ad spend', 'prefers referrals', 'limited monthly budget', 'local reputation risk'],
    alternatives: ['word of mouth', 'Facebook groups', 'Google Maps listing', 'WhatsApp', 'local flyers'],
    evidence: ['nearby examples', 'before-after numbers', 'simple monthly cost', 'visible local reviews', 'quick setup'],
  },
  retail: {
    roles: [
      'Retail Customer', 'Store Manager', 'E-commerce Shopper', 'Parent',
      'Student', 'Office Worker', 'Content Creator', 'Local Shop Owner',
      'Procurement Assistant', 'Loyalty Program User',
    ],
    industries: ['Retail', 'E-commerce', 'Consumer Goods', 'Hospitality', 'Media & Entertainment'],
    techBias: 0,
    incomeBias: 'medium',
    needs: ['better value for money', 'convenient purchase', 'reliable availability', 'simple returns', 'personal relevance'],
    triggers: ['discount window', 'urgent need', 'recommendation from friend', 'bad experience with current option', 'seasonal purchase'],
    barriers: ['price sensitivity', 'delivery trust', 'unclear quality', 'too many similar options', 'return hassle'],
    alternatives: ['Amazon or marketplace', 'local store', 'Instagram shop', 'existing brand', 'doing nothing'],
    evidence: ['reviews', 'clear price comparison', 'real photos', 'return policy', 'social proof'],
  },
  marketplace: {
    roles: [
      'Supply-side Partner', 'Service Provider', 'Small Business Owner', 'End Customer',
      'Marketplace Power User', 'Operations Manager', 'Restaurant Owner',
      'Freelancer', 'Local Vendor', 'Procurement Specialist',
    ],
    industries: ['Marketplace', 'Local Services', 'Hospitality', 'E-commerce', 'Retail'],
    regions: ['Croatia', 'Western Europe', 'Southern Europe', 'DACH region', 'Local urban area'],
    techBias: 1,
    incomeBias: 'medium',
    needs: ['more demand on one side', 'reliable supply', 'trust between parties', 'lower coordination friction', 'clear commissions'],
    triggers: ['empty capacity', 'expensive customer acquisition', 'poor discovery', 'manual matching pain', 'need for new channel'],
    barriers: ['chicken-and-egg problem', 'commission resistance', 'platform trust', 'fear of low-quality leads', 'operational complexity'],
    alternatives: ['direct referrals', 'Google search', 'Facebook groups', 'booking platforms', 'manual broker'],
    evidence: ['active local supply and demand', 'transparent fees', 'quality controls', 'early liquidity metrics', 'partner testimonials'],
  },
  physical_product: {
    roles: [
      'Retail Customer', 'Homeowner', 'Procurement Manager', 'Store Manager',
      'Operations Manager', 'Parent', 'Construction Supervisor', 'Hotel Manager',
      'E-commerce Shopper', 'Small Business Owner',
    ],
    industries: ['Consumer Goods', 'Retail', 'Manufacturing', 'Construction', 'Hospitality'],
    techBias: 0,
    incomeBias: 'medium',
    needs: ['durable product quality', 'clear practical benefit', 'easy purchase', 'service or warranty', 'fits existing workflow'],
    triggers: ['replacement need', 'new project', 'equipment failure', 'gift or seasonal demand', 'bulk buying moment'],
    barriers: ['quality uncertainty', 'shipping cost', 'warranty concern', 'storage or installation hassle', 'price comparison'],
    alternatives: ['known brand', 'local supplier', 'DIY workaround', 'used product', 'marketplace listing'],
    evidence: ['warranty', 'materials proof', 'demo video', 'third-party reviews', 'clear specifications'],
  },
  generic: {
    roles: B2C_ROLES,
    industries: INDUSTRIES,
    techBias: 0,
    needs: ['save time', 'reduce uncertainty', 'get better value', 'avoid hassle', 'feel in control'],
    triggers: ['current solution becomes annoying', 'friend recommendation', 'deadline pressure', 'budget change', 'new habit'],
    barriers: ['unclear value', 'switching effort', 'trust gap', 'price sensitivity', 'no urgent need'],
    alternatives: ['manual workaround', 'existing app', 'asking friends', 'Google search', 'doing nothing'],
    evidence: ['reviews', 'free trial', 'clear examples', 'transparent price', 'simple onboarding'],
  },
};

function classifyPersonaBank(input?: {
  businessModel?: 'B2B' | 'B2C' | 'B2B2C';
  inferredCategory?: string;
  pitch?: string;
  description?: string;
}): PersonaBankKey {
  const text = `${input?.inferredCategory || ''} ${input?.pitch || ''} ${input?.description || ''}`.toLowerCase();
  if (/fintech|bank|payment|plać|plac|invoice|račun|racun|accounting|crypto|loan|credit/.test(text)) return 'fintech';
  if (/marketplace|platforma|povezuje|connects|two-sided|dostav|delivery|partner/.test(text)) return 'marketplace';
  if (/lokal|obrt|uslug|monta|prozora|salon|restoran|servis|čišćen|ciscen|renov|majstor|vodoinst/.test(text)) return 'local_service';
  if (/trgovin|shop|store|retail|e-commerce|ecommerce|webshop|prodaj/.test(text)) return 'retail';
  if (/proizvod|physical|hardware|uređaj|uredaj|device|pakiranje|manufactur|materijal/.test(text)) return 'physical_product';
  if (/saas|startup|software|softver|app|aplikacij|platform|ai|automatiz/.test(text) || input?.businessModel === 'B2B') return 'startup_saas';
  return 'generic';
}

function bankFor(input?: Parameters<typeof classifyPersonaBank>[0]): PersonaBankProfile {
  return PERSONA_BANKS[classifyPersonaBank(input)];
}

function pickFrom<T>(items: readonly T[], index: number, fallback: readonly T[]): T {
  const pool = items.length ? items : fallback;
  return pool[index % pool.length];
}

function pickMany<T>(items: readonly T[], start: number, count: number): T[] {
  if (!items.length) return [];
  return Array.from({ length: count }, (_, offset) => items[(start + offset * 2) % items.length]);
}

function roleLooksBusiness(role: string): boolean {
  return /\b(owner|founder|ceo|cto|cfo|director|manager|lead|procurement|operations|sales|marketing|hr|restaurant|partner|business|admin|administrator|executive)\b/i.test(role);
}

function marketSideForRole(role: string): PersonaAttributes['market_side'] {
  return roleLooksBusiness(role) ? 'payer' : 'user';
}

/**
 * Anti-sikofancija: ~pola skeptika su 'hostile' (teško osvojivi), ostali 'indifferent';
 * dio mainstreama 'indifferent'; early adopteri 'open'. Cilj ~15% hostile ukupno.
 */
function dispositionFor(
  type: BuyerType,
  i: number
): 'hostile' | 'indifferent' | 'open' {
  if (type === 'skeptic') return i % 2 === 0 ? 'hostile' : 'indifferent';
  if (type === 'mainstream') return i % 4 === 0 ? 'indifferent' : 'open';
  return 'open';
}

/** Psihografija (Faza 2): vrijednosti + stil odluke, deterministički iz osobnosti/tipa. */
const VALUE_SETS: Record<(typeof PERSONALITIES)[number], string[]> = {
  enthusiast: ['novelty', 'status', 'community', 'self-improvement'],
  pragmatist: ['efficiency', 'value for money', 'reliability', 'time-saving'],
  cynic: ['security', 'proof', 'control', 'privacy'],
};
function psychographicsFor(
  personality: (typeof PERSONALITIES)[number],
  type: BuyerType,
  i: number
): { values: string[]; decision_style: PersonaAttributes['decision_style'] } {
  const pool = VALUE_SETS[personality];
  const values = [pool[i % pool.length], pool[(i + 2) % pool.length]];
  const decision_style: PersonaAttributes['decision_style'] =
    type === 'early_adopter' && i % 2 === 0
      ? 'impulsive'
      : personality === 'pragmatist'
        ? 'analytical'
        : personality === 'cynic'
          ? 'risk_averse'
          : 'social_proof';
  return { values, decision_style };
}

function marketContextFor(bank: PersonaBankProfile, type: BuyerType, i: number) {
  const barrierCount = type === 'skeptic' ? 3 : 2;
  const evidenceCount = type === 'early_adopter' ? 1 : 2;
  return {
    core_needs: pickMany(bank.needs, i, 2),
    buying_triggers: pickMany(bank.triggers, i + (type === 'early_adopter' ? 1 : 0), 2),
    adoption_barriers: pickMany(bank.barriers, i + (type === 'skeptic' ? 1 : 0), barrierCount),
    current_alternatives: pickMany(bank.alternatives, i, 2),
    evidence_required: pickMany(bank.evidence, i + (type === 'skeptic' ? 2 : 0), evidenceCount),
  };
}

export function generatePersonas(
  count: number,
  businessModel: 'B2B' | 'B2C' | 'B2B2C' = 'B2C',
  context?: {
    inferredCategory?: string;
    pitch?: string;
    description?: string;
    targetMarket?: string;
  }
): PersonaAttributes[] {
  const personas: PersonaAttributes[] = [];
  let id = 1;
  const bank = bankFor({
    businessModel,
    inferredCategory: context?.inferredCategory,
    pitch: context?.pitch,
    description: context?.description,
  });

  const distribution = [
    { type: 'early_adopter' as const, fraction: 0.20 },
    { type: 'mainstream' as const, fraction: 0.50 },
    { type: 'skeptic' as const, fraction: 0.30 },
  ];

  const roles = bank.roles.length ? bank.roles : businessModel === 'B2B' ? B2B_ROLES : B2C_ROLES;

  for (const { type, fraction } of distribution) {
    const groupSize = type === 'skeptic'
      ? count - Math.floor(count * 0.70)
      : Math.floor(count * fraction);

    const baseTech = type === 'early_adopter' ? 7 : type === 'skeptic' ? 3 : 5;
    const baseAge = type === 'early_adopter' ? 27 : type === 'skeptic' ? 43 : 34;

    for (let i = 0; i < groupSize; i++) {
      const techVariance = (i % 3) - 1;
      const ageVariance = (i % 5) * 3;
      const incomeShift = type === 'early_adopter' ? 1 : 0;

      const isB2B2CPayer = businessModel === 'B2B2C' && id % 2 === 1;
      const rolePool = businessModel === 'B2B2C'
        ? isB2B2CPayer
          ? B2B_ROLES
          : bank.roles.length ? bank.roles : B2C_ROLES
        : roles;
      const role = rolePool[(i * 3 + Math.floor(i / rolePool.length)) % rolePool.length];
      const incomePool = bank.incomeBias
        ? [bank.incomeBias, bank.incomeBias, neighborIncome(bank.incomeBias)]
        : INCOMES;

      personas.push({
        id: id++,
        age: Math.min(62, Math.max(22, baseAge + ageVariance)),
        role,
        industry: pickFrom(bank.industries, i * 7, INDUSTRIES),
        tech_literacy: Math.max(1, Math.min(10, baseTech + bank.techBias + techVariance)),
        income: incomePool[(i * 5 + incomeShift) % incomePool.length],
        buyer_type: type,
        region: context?.targetMarket || pickFrom(bank.regions ?? [], i * 11, REGIONS),
        personality: PERSONALITIES[i % PERSONALITIES.length],
        market_side:
          businessModel === 'B2B'
            ? 'payer'
            : businessModel === 'B2C'
              ? 'user'
              : isB2B2CPayer
                ? 'payer'
                : 'user',
        disposition: dispositionFor(type, i),
        ...marketContextFor(bank, type, i),
        ...psychographicsFor(PERSONALITIES[i % PERSONALITIES.length], type, i),
      });
    }
  }

  return personas;
}

/** Susjedni prihod (za malo varijacije unutar segmenta s fiksnim težištem). */
function neighborIncome(skew: 'low' | 'medium' | 'high'): typeof INCOMES[number] {
  return skew === 'low' ? 'medium' : skew === 'high' ? 'medium' : 'low';
}

/**
 * Generira persone CILJANO po zadanim segmentima (publikama).
 * LLM definira "tko je publika" (SegmentSpec), a ovaj kod deterministički
 * popunjava kvote unutar svakog segmenta — uz istu 20/50/30 raspodjelu
 * (early adopter / mainstream / skeptik), tako da nijedan segment nije monolitan.
 * Svaka persona nosi `segment = spec.label` za kasniju agregaciju po segmentu.
 */
export function generatePersonasForSegments(
  specs: SegmentSpec[],
  perSegment: number
): PersonaAttributes[] {
  const personas: PersonaAttributes[] = [];
  let id = 1;

  for (const spec of specs) {
    const segmentBank = bankFor({
      inferredCategory: `${spec.label} ${spec.description}`,
      pitch: spec.rationale,
      description: `${spec.roles.join(' ')} ${spec.regions.join(' ')}`,
    });
    const genericRoles = new Set(['professional', 'customer', 'user', 'buyer', 'consumer', 'end user']);
    const specificRoles = spec.roles.filter((role) => !genericRoles.has(role.trim().toLowerCase()));
    const roles = [...specificRoles, ...segmentBank.roles].filter(Boolean).slice(0, 12);
    const [ageMin, ageMax] = spec.age_range;
    const ageSpan = Math.max(1, ageMax - ageMin);
    const [techMin, techMax] = spec.tech_range;
    const regions = spec.regions.length ? spec.regions : REGIONS;

    const early = Math.round(perSegment * 0.2);
    const skeptic = Math.round(perSegment * 0.3);
    const groups = [
      { type: 'early_adopter' as const, size: early },
      { type: 'skeptic' as const, size: skeptic },
      { type: 'mainstream' as const, size: perSegment - early - skeptic },
    ];

    let i = 0;
    for (const { type, size } of groups) {
      for (let g = 0; g < size; g++, i++) {
        // dob: raširena kroz raspon, pomaknuta po tipu kupca
        const ageNudge = type === 'early_adopter' ? -3 : type === 'skeptic' ? 4 : 0;
        const age = Math.min(
          ageMax,
          Math.max(ageMin, ageMin + ((i * 7) % (ageSpan + 1)) + ageNudge)
        );

        // tech: early pri vrhu raspona, skeptik pri dnu, mainstream sredina
        const techBase =
          type === 'early_adopter' ? techMax : type === 'skeptic' ? techMin : Math.round((techMin + techMax) / 2);
        const tech = Math.max(1, Math.min(10, Math.max(techMin, Math.min(techMax, techBase + ((i % 3) - 1)))));

        // prihod: težište segmenta, uz povremenu varijaciju
        let income: typeof INCOMES[number];
        if (spec.income_skew === 'mixed') {
          income = INCOMES[(i + (type === 'early_adopter' ? 1 : 0)) % INCOMES.length];
        } else {
          income = i % 4 === 3 ? neighborIncome(spec.income_skew) : spec.income_skew;
        }

        const role = roles[(i * 3 + Math.floor(i / roles.length)) % roles.length];

        personas.push({
          id: id++,
          age,
          role,
          industry: pickFrom(segmentBank.industries, i * 7, INDUSTRIES),
          tech_literacy: tech,
          income,
          buyer_type: type,
          region: regions[(i * 11) % regions.length],
          personality: PERSONALITIES[i % PERSONALITIES.length],
          segment: spec.label,
          market_side: marketSideForRole(role),
          disposition: dispositionFor(type, g),
          ...marketContextFor(segmentBank, type, i),
          ...psychographicsFor(PERSONALITIES[i % PERSONALITIES.length], type, g),
        });
      }
    }
  }

  return personas;
}
