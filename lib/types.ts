export interface PersonaAttributes {
  id: number;
  age: number;
  role: string;
  industry: string;
  tech_literacy: number;
  income: 'low' | 'medium' | 'high';
  buyer_type: 'early_adopter' | 'mainstream' | 'skeptic';
  region: string;
  personality: 'enthusiast' | 'pragmatist' | 'cynic';
  /** Koju stranu trzista persona predstavlja. Kod B2B2C cijena/conjoint se racunaju na platisama. */
  market_side?: 'payer' | 'user' | 'partner' | 'both';
  /** Naziv ciljane publike (segmenta) kojoj persona pripada; prazno za generičku publiku */
  segment?: string;
  /**
   * Stav prema novim proizvodima (anti-sikofancija): 'hostile' = teško ga osvojiti,
   * 'indifferent' = treba jak razlog da uopće razmotri, 'open' = otvoren. ~15% hostile.
   */
  disposition?: 'hostile' | 'indifferent' | 'open';
  /* ── Psihografija (Faza 2) — obogaćuje simulaciju, ne mijenja izlaz reakcije ── */
  /** Vrijednosti kojima se vodi (npr. ["efficiency","value for money"]) */
  values?: string[];
  /** Stil donošenja odluke */
  decision_style?: 'analytical' | 'impulsive' | 'social_proof' | 'risk_averse';
  /** Konkretne potrebe zbog kojih bi uopće razmatrala proizvod */
  core_needs?: string[];
  /** Okidači koji bi je natjerali da sada traži rješenje */
  buying_triggers?: string[];
  /** Razlozi zbog kojih bi usporila ili odbila adopciju */
  adoption_barriers?: string[];
  /** Što bi realno koristila danas umjesto novog proizvoda */
  current_alternatives?: string[];
  /** Kakav dokaz traži prije ozbiljne kupnje */
  evidence_required?: string[];
}

/**
 * Specifikacija jedne kandidat-publike koju AI predloži prije testa.
 * Generacijski hintovi (roles/age/regions/income/tech) deterministički
 * pune kvote persona za taj segment — LLM definira "tko", kod generira "koliko".
 */
export interface SegmentSpec {
  /** Stabilan ključ za UI (npr. 'seg1') */
  id: string;
  /** Naziv publike na jeziku korisnika (npr. "Freelance dizajneri") */
  label: string;
  /** Kratki opis (1 rečenica) */
  description: string;
  /** 3-6 konkretnih uloga/profila iz kojih se generiraju persone */
  roles: string[];
  /** Raspon dobi [min, max] */
  age_range: [number, number];
  /** 1-3 regije */
  regions: string[];
  /** Težište prihoda segmenta */
  income_skew: 'low' | 'medium' | 'high' | 'mixed';
  /** Raspon tehnološke pismenosti [min, max], 1-10 */
  tech_range: [number, number];
  /** Zašto bi ovaj segment mogao kupiti — kontekst za sintezu */
  rationale: string;
}

/** Agregirani rezultat po jednom segmentu (računa se iz reakcija u kodu). */
export interface AudienceSegment {
  label: string;
  description: string;
  personas_count: number;
  score: number;
  intent: { buy: number; maybe: number; reject: number };
  /** Najčešći razlog (klasterirano, 1 kratka rečenica) */
  top_reason: string;
  /** Kako je segment primio proizvod (1 rečenica) */
  verdict: string;
}

export interface PersonaReaction {
  persona_id: number;
  decision: 'buy' | 'maybe' | 'reject';
  main_reason: string;
  objections: string[];
  questions: string[];
  quote: string;
  willingness_to_pay: string;
  /* ── Jobs-to-Be-Done (Faza 1) — opcionalno radi kompatibilnosti starih izvještaja ── */
  /** Koji problem bi persona "zaposlila" proizvod da riješi */
  problem_to_solve?: string;
  /** Što koristi DANAS umjesto ovoga (konkurent, ručni workaround, "ništa") = prava konkurencija */
  current_alternative?: string;
  /** Konkretne sumnje PRIJE kupnje (0-3) */
  doubts?: string[];
  /** 1-10: koliko je važno riješiti taj problem */
  importance?: number;
  /** 1-10: koliko je već zadovoljan postojećom alternativom */
  satisfaction?: number;
}

/**
 * Emergentni klaster (LCA-lite) — nastaje IZ stvarnih reakcija (k-means u kodu),
 * NE unaprijed kao SegmentSpec. "Od 100 agenata, 3 prirodne skupine."
 * Brojke iz koda; label/descriptor puni LLM.
 */
export interface EmergentCluster {
  id: number;
  /** Kratki naziv skupine (LLM), npr. "Cjenovno osjetljivi pragmatici" */
  label: string;
  /** 1 rečenica: po čemu se skupina razlikuje (LLM) */
  descriptor: string;
  size: number;
  size_pct: number;
  intent: { buy: number; maybe: number; reject: number };
  avg_opportunity: number;
  avg_importance: number;
  avg_satisfaction: number;
  /** Najčešći prigovor u skupini (kod) */
  top_objection: string;
  /** Najčešći problem koji žele riješiti (kod) */
  top_problem: string;
  persona_ids: number[];
}

/* ── Conjoint analiza (Faza 3) — forsiran trade-off između paketa ── */

/** Jedan atribut i njegove razine (npr. Cijena: ["9€","19€","39€"]). */
export interface ConjointAttribute {
  name: string;
  levels: string[];
}

/** Rezultat za jednu razinu: part-worth utility (preferencijski indeks 0-100 unutar atributa). */
export interface ConjointLevelResult {
  level: string;
  utility: number;
}

/** Rezultat za jedan atribut: relativna važnost (%) + part-worth po razini. */
export interface ConjointAttributeResult {
  name: string;
  /** Relativna važnost atributa (%), svi atributi zajedno ~100 */
  importance: number;
  levels: ConjointLevelResult[];
  best_level: string;
}

/** Rezultat conjoint analize — koliko je kojem kupcu bitan koji atribut naspram cijene. */
export interface ConjointAnalysis {
  attributes: ConjointAttributeResult[];
  sample_size: number;
  /** Opis uzorka koji je koristen, npr. "business payers" za B2B2C. */
  sample_label?: string;
  tasks: number;
  /** Najpoželjniji paket (najbolja razina svakog atributa) */
  winning_combo: { attribute: string; level: string }[];
  /** Zaključak u 1-2 rečenice (templejt iz koda) */
  verdict: string;
}

/** Marketinški kut po skupini — kako pozicionirati proizvod za svaki klaster (Faza 3). */
export interface MarketingAngle {
  /** Skupina na koju cilja (label klastera; prazno ako je opći kut) */
  cluster_label?: string;
  /** Udio te skupine (%) */
  target_pct?: number;
  /** Glavni kut/pozicioniranje, npr. "Ušteda vremena" */
  angle: string;
  /** Konkretna poruka/headline za oglas ili landing */
  message: string;
  /** Dokaz ili razlog za vjerovanje koji poruku cini uvjerljivijom */
  proof?: string;
  /** Preporučeni kanal (gdje pustiti tu poruku) */
  channel: string;
  /** Konkretan iduci korak za kampanju/landing */
  cta?: string;
  /** Prigovor koji poruka mora preduhitriti */
  preempt_objection: string;
}

/**
 * Opportunity Score (Ulwick ODI) — agregat iz reakcija, RAČUNAT U KODU.
 * Visok = problem važan, a postojeće rješenje loše → tu je prilika.
 */
export interface OpportunityAnalysis {
  /** 0-100 agregatni opportunity score */
  score: number;
  /** Prosječna važnost problema (1-10) */
  avg_importance: number;
  /** Prosječno zadovoljstvo postojećim alternativama (1-10) */
  avg_satisfaction: number;
  /** Zaključak u 1-2 rečenice (templejt na jeziku korisnika) */
  verdict: string;
  /** Najveće neispunjene potrebe (problemi s najvišim opportunity scoreom) */
  top_problems: { problem: string; importance: number; satisfaction: number; opportunity: number }[];
  /** Najčešće stvarne alternative koje kupci danas koriste (= prava konkurencija) */
  top_alternatives: { name: string; count: number }[];
}

/** Četiri Van Westendorp praga cijene koje jedna persona "osjeća" za proizvod. */
export interface PricePoint {
  persona_id: number;
  /** Toliko jeftino da sumnja u kvalitetu */
  too_cheap: number;
  /** Povoljno / odlična vrijednost */
  cheap: number;
  /** Počinje biti skupo, ali bi još razmislio */
  expensive: number;
  /** Toliko skupo da NE bi kupio */
  too_expensive: number;
}

/** Jedna točka krivulje (postotak ispitanika za danu cijenu). */
export interface PricingCurvePoint {
  price: number;
  too_cheap: number;
  cheap: number;
  expensive: number;
  too_expensive: number;
}

/**
 * Rezultat Van Westendorp analize osjetljivosti na cijenu.
 * Brojke (presjeci krivulja) računaju se U KODU iz odgovora persona — ne iz LLM-a.
 */
export interface PricingAnalysis {
  /** Simbol/oznaka valute (npr. "€") */
  currency: string;
  /** Jedinica/period cijene (npr. "/mj") ako se da iščitati */
  unit: string;
  sample_size: number;
  /** Opis uzorka koji je koristen, npr. "business payers" za B2B2C. */
  sample_label?: string;
  /** Optimal Price Point — presjek "too cheap" i "too expensive" */
  opp: number;
  /** Indifference Price Point — presjek "cheap" i "expensive" */
  ipp: number;
  /** Point of Marginal Cheapness — donja granica raspona */
  pmc: number;
  /** Point of Marginal Expensiveness — gornja granica raspona */
  pme: number;
  /** Prihvatljiv raspon cijene [PMC, PME] */
  range: { low: number; high: number };
  /** Podaci za graf (cijena → kumulativni postoci) */
  curve: PricingCurvePoint[];
  /** Founderova trenutna cijena iščitana iz price_model (null ako se ne da) */
  current_price: number | null;
  /** Zaključak u 1-2 rečenice (jezik korisnika) */
  verdict: string;
}

/** Jedno pitanje za customer-discovery intervju sa stvarnim ljudima (Mom Test stil). */
export interface InterviewQuestion {
  /** Nesugestivno pitanje — o prošlom ponašanju, ne "bi li kupio" */
  question: string;
  /** Koju pretpostavku/rizik testira (kratko) */
  why: string;
  /** Kakav odgovor je signal (potvrda ili crvena zastava) */
  listen_for: string;
}

/** "Kit" za izlazak iz sintetičke validacije prema pravim razgovorima. */
export interface InterviewKit {
  /** Koga točno intervjuirati (1-2 rečenice) */
  who_to_interview: string;
  /** Konkretna mjesta/kanali gdje pronaći te ljude */
  where_to_find: string[];
  /** ~8 pitanja */
  questions: InterviewQuestion[];
  /** Glavna zamka koju izbjeći (sugestivno pitanje, pitching) */
  avoid: string;
}

/** Jedna poluga preokreta — konkretna promjena koja bi pretvorila ne-kupce u kupce. */
export interface ConversionLever {
  /** Konkretna promjena koju founder može napraviti */
  change: string;
  /** Koju prepreku/prigovor uklanja */
  addresses: string;
  /** Procjena: koliki % trenutnih "možda+odbija" bi mogao preokrenuti (0-100) */
  could_convert: number;
  /** Procjena truda za izvedbu */
  effort: 'low' | 'medium' | 'high';
}

/** Prioritizirani plan kako odbijače pretvoriti u kupce. */
export interface ConversionPlan {
  summary: string;
  levers: ConversionLever[];
  /** Kod B2B2C plan moze biti razdvojen na biznis/platisu i korisnicku potraznju. */
  sections?: Array<{
    side: 'payer' | 'user';
    label: string;
    summary: string;
    levers: ConversionLever[];
  }>;
}

export type StrategyMode = 'go_bigger' | 'tighten_wedge' | 'fix_objections' | 'prepare_launch';

export interface StrategyTask {
  title: string;
  details: string;
  owner: 'product' | 'marketing' | 'sales' | 'research' | 'legal' | 'business';
  priority: 'low' | 'medium' | 'high';
}

export interface StrategyReview {
  mode: StrategyMode;
  recommendation: string;
  strategic_read: string;
  accepted_scope: string[];
  not_in_scope: string[];
  next_tasks: StrategyTask[];
  risks: string[];
  open_decisions: string[];
  created_at: string;
}

export interface NextExperiment {
  hypothesis: string;
  who_to_test: string;
  where_to_find: string[];
  outreach_message: string;
  duration: string;
  success_criteria: string[];
}

export interface ValidationReport {
  meta: {
    product_name: string;
    personas_count: number;
    generated_at: string;
    disclaimer: string;
  };
  score: number;
  summary: string;
  intent: { buy: number; maybe: number; reject: number };
  confidence?: {
    score: number;
    label: 'low' | 'medium' | 'high';
    reasons: string[];
    missing_evidence: string[];
  };
  target_audience: {
    profile: string;
    assumption_vs_reality: string;
    radar_data: { tech: number; budget: number; time_saving: number; risk: number };
    top_reasons_to_buy: string[];
  };
  rejection: {
    reasons: Array<{ reason: string; percentage: number }>;
    quotes: string[];
  };
  top_questions: string[];
  action_plan: {
    product: string;
    marketing: string;
    pricing: string;
  };
  next_experiment?: NextExperiment;
  /** Usporedba kako je ideju primio svaki ciljani segment (ako je test rađen po publikama) */
  segments?: AudienceSegment[];
  /** Van Westendorp analiza cijene (popunjava se on-demand na results stranici) */
  pricing?: PricingAnalysis;
  /** Kit pitanja za prave customer-discovery intervjue (on-demand) */
  interview?: InterviewKit;
  /** Prioritizirani plan kako ne-kupce pretvoriti u kupce (on-demand) */
  conversion?: ConversionPlan;
  /** Strateški review nakon validacije: odabir smjera i sljedeći sprint. */
  strategy?: StrategyReview;
  research_reports?: ResearchReport[];
  /** Opportunity Score (JTBD) — važnost problema vs zadovoljstvo tržišta (Faza 1) */
  opportunity?: OpportunityAnalysis;
  /** Emergentni klasteri iz stvarnih reakcija (k-means, Faza 2) */
  clusters?: EmergentCluster[];
  /** Marketinški kutevi po skupini (on-demand, Faza 3) */
  angles?: MarketingAngle[];
  /** Conjoint analiza — važnost atributa naspram cijene (on-demand, Faza 3) */
  conjoint?: ConjointAnalysis;
  personas?: PersonaAttributes[];
  reactions?: PersonaReaction[];
}

/* ─────────────────────────────────────────────────────────────
   AI SAVJETNICI + BAZA ZNANJA O PROJEKTU
   ───────────────────────────────────────────────────────────── */

/** 5 AI savjetnika */
export type AgentId = 'tech' | 'marketing' | 'legal' | 'business' | 'sales' | 'distribution';

/** Sekcije baze znanja (biznis plan koji se popunjava u pozadini) */
export type KBSectionKey = 'product' | 'technical' | 'marketing' | 'legal' | 'business' | 'sales' | 'distribution';

export type MemoryKind = 'fact' | 'gap' | 'decision' | 'risk' | 'preference' | 'task';

export interface MemoryItem {
  id: string;
  text: string;
  kind: MemoryKind;
  importance: number;
  confidence: number;
  source: 'seed' | 'chat' | 'intake' | 'validation' | 'research' | 'manual';
  mentions: number;
  created_at: string;
  last_seen_at: string;
}

/** Jedna sekcija baze znanja. `facts` = potvrđeno znanje, `gaps` = otvorena pitanja. */
export interface KBSection {
  /** Kratki sažetak sekcije (1-2 rečenice) */
  summary: string;
  /** Konkretne potvrđene činjenice izvučene iz razgovora/unosa */
  facts: string[];
  /** Otvorene rupe koje još treba popuniti */
  gaps: string[];
  /** Scored memorije za pametno filtriranje konteksta (kompatibilno sa starim facts/gaps). */
  memories?: MemoryItem[];
}

/**
 * Baza znanja o projektu — strukturirani "biznis plan" koji se gradi u pozadini
 * dok korisnik razgovara s agentima. Ovo je izvor istine za kontekst agenata.
 */
export interface ProjectKnowledge {
  sections: Record<KBSectionKey, KBSection>;
  /**
   * Sažeta verzija cijelog projekta (proizvod indeksera) — kratki tekst koji se
   * šalje agentima umjesto cijelog razgovora, da ne moraju "žvakati" sve.
   */
  digest: string;
  /** Odgovori iz onboarding upitnika (početni kontekst) */
  onboarding: OnboardingAnswers | null;
  updated_at: string;
}

/** Onboarding odgovori — daju agentima početni kontekst prije otključavanja chata. */
export interface OnboardingAnswers {
  country: string;
  tech_situation: string;
  stage: string;
  marketing_budget: string;
  primary_goal: string;
  extra?: string;
}

/** Jedna markdown nota za Obsidian vault (transport-neovisno: path + sadržaj). */
export interface ObsidianNote {
  /** Relativna putanja unutar odabranog foldera, npr. "AI Validator/FitMeal/FitMeal.md" */
  path: string;
  /** Cijeli markdown sadržaj note (frontmatter + tijelo s [[linkovima]]) */
  markdown: string;
}

/** Jedan web izvor (link) iz istraživanja. */
export interface ResearchSource {
  title: string;
  url: string;
  snippet?: string;
}

/** Jedan nalaz iz strukturiranog istraživanja. */
export interface ResearchFinding {
  point: string;
  detail?: string;
}

/** Kut istraživanja — preset upiti za česte potrebe validacije. */
export type ResearchAngle =
  | 'competitors'
  | 'pricing'
  | 'voice_of_customer'
  | 'demand'
  | 'grants'
  | 'funding'
  | 'local_growth'
  | 'custom';

/** Strukturirani izvještaj web istraživanja (Tavily dohvat + LLM sinteza s izvorima). */
export interface ResearchReport {
  query: string;
  angle: ResearchAngle;
  /** 2-4 rečenice sažetka, uzemljeno u izvore */
  summary: string;
  findings: ResearchFinding[];
  sources: ResearchSource[];
  created_at: string;
}

/** Jedna poruka u chatu s agentom. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: string;
  /** za assistant poruke u multi-agent chatu: koji je agent govorio */
  agentId?: AgentId;
  /** web izvori koje je istraživač dohvatio za ovaj odgovor (ako ih je agent zatražio) */
  sources?: ResearchSource[];
  /** status web istraživanja, da UI jasno razlikuje Tavily/web od običnog AI savjeta */
  research?: {
    attempted: boolean;
    used: boolean;
    query?: string;
    error?: string;
    tool?: string;
    toolLabel?: string;
  };
  /** skuplji/dublji odgovor savjetnika */
  response_mode?: 'fast' | 'deep';
}

/** Jedan actionable task iz razgovora sa savjetnicima. */
export interface ProjectTask {
  id: string;
  title: string;
  details: string;
  owner_agent?: AgentId;
  source_summary?: string;
  status: 'open' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Spremljeni projekt — lokalni zapis projekta.
 * Ovo je glavni "ugovor" za pohranu: idea (ulaz) + report (izlaz) + meta.
 * Sažeti `summary` blok omogućuje listanje bez učitavanja cijelog izvještaja.
 */
export interface SavedProject {
  /** Lokalni ID projekta. */
  id: string;
  /** Lokalni profil/vlasnik. U desktop buildu ovo može postati profil ili workspace ID. */
  owner_uid: string;
  /** 'draft' = samo ideja unesena; 'validated' = postoji AI izvještaj */
  status: 'draft' | 'validated';

  /** Kompletan korisnički unos (sve info o projektu) */
  idea: IdeaFormData;
  /** AI izvještaj — null ako projekt još nije validiran */
  report: ValidationReport | null;

  /** Baza znanja koja se gradi kroz razgovor s AI savjetnicima — null dok onboarding nije završen */
  knowledge: ProjectKnowledge | null;
  /** Centralni panel chat — jedan grupni razgovor sa svim savjetnicima (govornik u msg.agentId) */
  panel: ChatMessage[];
  /** Jednostavni task manager iz razgovora sa savjetnicima. */
  tasks: ProjectTask[];
  /** @deprecated stari 1-na-1 chatovi po agentu; zadržano za kompatibilnost starih dokumenata */
  chats: Partial<Record<AgentId, ChatMessage[]>>;

  /** Denormalizirani sažetak za brzo listanje (bez učitavanja cijelog reporta) */
  summary: {
    product_name: string;
    business_model: IdeaFormData['business_model'];
    elevator_pitch: string;
    score: number | null;
    personas_count: number | null;
  };

  /** ISO timestampi */
  created_at: string;
  updated_at: string;
}

/** Ono što šaljemo pri kreiranju/spremanju (bez id-a i timestampova koje postavlja sloj podataka) */
export type SaveProjectInput = {
  idea: IdeaFormData;
  report: ValidationReport | null;
};

export interface GeoAreaSelection {
  label: string;
  center: { lat: number; lng: number };
  points: Array<{ lat: number; lng: number }>;
  bounds: { north: number; south: number; east: number; west: number };
}

export interface DiscoveryAnswer {
  question: string;
  answer: string;
  category: 'buyer' | 'pain' | 'status_quo' | 'wedge' | 'proof' | 'risk';
}

export interface AdaptiveIntakeAnswer {
  question: string;
  answer: string;
  category: string;
}

export interface IdeaFormData {
  business_model: 'B2B' | 'B2C' | 'B2B2C';
  product_name: string;
  elevator_pitch: string;
  detailed_description: string;
  price_model: string;
  target_market?: string;
  assumed_customer?: string;
  competitors?: string;
  website_url?: string;
  website_context?: string;
  document_context?: string;
  geo_area?: GeoAreaSelection;
  geo_areas?: GeoAreaSelection[];
  b2b2c_consumer_description?: string;
  b2b2c_business_description?: string;
  initial_brief?: string;
  inferred_category?: string;
  adaptive_answers?: AdaptiveIntakeAnswer[];
  discovery_answers?: DiscoveryAnswer[];
  personas?: PersonaAttributes[];
  /** Odabrane ciljane publike — ako su prisutne, motor generira persone po segmentu */
  segmentSpecs?: SegmentSpec[];
  clarifications?: Array<{ question: string; answer: string }>;
  language?: 'hr' | 'en';
  /** Dubina simulacije: 'standard' (~100 agenata, free) ili 'deep' (~300, paid). Default standard. */
  depth?: 'standard' | 'deep';
}
