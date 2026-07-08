import type { MarketIntelligence, ProjectKnowledge, ValidationReport } from './types';
import { SECTION_KEYS, SECTION_LABELS } from './knowledge';

/**
 * Jedno kandidat-pitanje za dubinsko ispitivanje foundera.
 * Izvori: reakcije persona (pitanja/sumnje/prigovori), top pitanja izvještaja,
 * otvorene rupe iz baze znanja (biznis plana), te praznine iz istraživanja tržišta.
 */
export interface DiscoveryQuestion {
  side: 'payer' | 'user' | 'general';
  question: string;
  context?: string;
  source: 'question' | 'objection' | 'doubt' | 'gap' | 'market_gap';
  /** Sekcija biznis plana iz koje rupa dolazi (samo za source: 'gap') */
  section?: string;
}

/**
 * Gradi kandidat-pitanja iz izvještaja validacije: pitanja, sumnje i prigovori
 * stvarnih (simuliranih) persona + fallback pitanja po strani tržišta.
 * Čista funkcija — koristi je Dashboard (prikaz ploče) i /discovery (ispitivanje).
 */
export function buildDiscoveryQuestions(report: ValidationReport, language: 'hr' | 'en'): DiscoveryQuestion[] {
  const out: DiscoveryQuestion[] = [];
  const seen = new Set<string>();
  const objectionToQuestion = (objection: string) =>
    objection.endsWith('?')
      ? objection
      : language === 'en'
      ? `What would remove this objection: ${objection}?`
      : `Sto bi uklonilo ovaj prigovor: ${objection}?`;
  const quoteToQuestion = (quote: string) =>
    language === 'en'
      ? `What would convince you if you currently think: "${quote}"?`
      : `Sto bi te uvjerilo ako trenutno mislis: "${quote}"?`;
  const add = (item: DiscoveryQuestion) => {
    const key = item.question.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  if (report.personas?.length && report.reactions?.length) {
    const personaById = new Map(report.personas.map((persona) => [persona.id, persona]));
    report.reactions.forEach((reaction) => {
      const persona = personaById.get(reaction.persona_id);
      const side: DiscoveryQuestion['side'] =
        persona?.market_side === 'payer' || persona?.market_side === 'partner' || persona?.market_side === 'both'
          ? 'payer'
          : persona?.market_side === 'user'
          ? 'user'
          : 'general';

      reaction.questions?.forEach((question) => add({
        side,
        question,
        context: reaction.main_reason || reaction.quote,
        source: 'question',
      }));
      reaction.doubts?.forEach((doubt) => add({
        side,
        question: doubt.endsWith('?') ? doubt : `${doubt}?`,
        context: reaction.problem_to_solve || reaction.current_alternative || reaction.main_reason,
        source: 'doubt',
      }));
      reaction.objections?.forEach((objection) => add({
        side,
        question: objectionToQuestion(objection),
        context: reaction.quote || reaction.main_reason,
        source: 'objection',
      }));
    });
  }

  report.top_questions.forEach((question) => add({ side: 'general', question, source: 'question' }));
  report.rejection.quotes.forEach((quote) => add({
    side: 'general',
    question: quoteToQuestion(quote),
    context: quote,
    source: 'objection',
  }));

  const hasPayerSide = report.personas?.some((persona) =>
    persona.market_side === 'payer' || persona.market_side === 'partner' || persona.market_side === 'both'
  );
  const hasUserSide = report.personas?.some((persona) => persona.market_side === 'user');
  const fallback =
    language === 'en'
      ? {
          payer: [
            'What concrete ROI or business result would make this worth adopting?',
            'Who inside the company would approve this, and what would they need to see first?',
            'What existing tool, agency, or workflow would this replace?',
            'What risk would block the business from trying this in the next 30 days?',
            'What proof would make a paid pilot feel safe enough?',
            'How should pricing work so the business can justify it internally?',
          ],
          user: [
            'Why would an end user choose this instead of their current habit?',
            'What would need to be clear in the first 30 seconds for them to trust it?',
            'Which moment in their day would trigger them to use this?',
            'What would make them recommend it to another person?',
            'What data, privacy, or reliability concern would stop them?',
            'What must the experience do better than existing alternatives?',
          ],
          general: [
            'Which promise is still too vague and needs sharper proof?',
            'What is the smallest test that would validate real demand?',
            'What must be explained on the landing page before anyone converts?',
            'Which objection should be answered first in sales or marketing?',
          ],
        }
      : {
          payer: [
            'Koji konkretan ROI ili poslovni rezultat bi ovo ucinio vrijednim usvajanja?',
            'Tko u firmi odobrava ovakvu odluku i sto mora vidjeti prije toga?',
            'Koji postojeci alat, agenciju ili workflow ovo zapravo zamjenjuje?',
            'Koji rizik bi zaustavio biznis da ovo isproba u iducih 30 dana?',
            'Koji dokaz bi placeni pilot ucinio dovoljno sigurnim?',
            'Kako bi cijena trebala biti postavljena da je biznis moze interno opravdati?',
          ],
          user: [
            'Zasto bi krajnji korisnik izabrao ovo umjesto svoje trenutne navike?',
            'Sto mora biti jasno u prvih 30 sekundi da korisnik stekne povjerenje?',
            'U kojem trenutku dana ili putovanja bi korisnik stvarno koristio ovo?',
            'Sto bi korisnika natjeralo da ovo preporuci drugoj osobi?',
            'Koja briga oko podataka, privatnosti ili pouzdanosti bi ga zaustavila?',
            'Sto iskustvo mora raditi bolje od postojecih alternativa?',
          ],
          general: [
            'Koje obecanje je jos uvijek previse nejasno i treba konkretniji dokaz?',
            'Koji je najmanji test koji bi potvrdio stvarnu potraznju?',
            'Sto landing page mora objasniti prije nego netko konvertira?',
            'Koji prigovor treba prvi odgovoriti u prodaji ili marketingu?',
          ],
        };

  if (hasPayerSide || hasUserSide) {
    fallback.payer.forEach((question) => add({ side: 'payer', question, source: 'question' }));
    fallback.user.forEach((question) => add({ side: 'user', question, source: 'question' }));
  }
  fallback.general.forEach((question) => add({ side: 'general', question, source: 'question' }));

  return out.slice(0, 18);
}

/** Pretvara otvorene rupe iz baze znanja u kandidat-pitanja (source: 'gap'). */
export function buildKnowledgeGapQuestions(
  knowledge: ProjectKnowledge,
  language: 'hr' | 'en'
): DiscoveryQuestion[] {
  const out: DiscoveryQuestion[] = [];
  const seen = new Set<string>();
  for (const key of SECTION_KEYS) {
    const section = knowledge.sections[key];
    for (const gap of section?.gaps ?? []) {
      const question = gap.trim().endsWith('?') ? gap.trim() : `${gap.trim()}?`;
      const dedupe = question.toLowerCase();
      if (!dedupe || seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        side: 'general',
        question,
        context: SECTION_LABELS[key][language],
        source: 'gap',
        section: key,
      });
    }
  }
  return out.slice(0, 14);
}

/** Pretvara praznine iz istraživanja tržišta u kandidat-pitanja (source: 'market_gap'). */
export function buildMarketGapQuestions(
  market: MarketIntelligence,
  language: 'hr' | 'en'
): DiscoveryQuestion[] {
  const out: DiscoveryQuestion[] = [];
  const seen = new Set<string>();
  const toQuestion = (gap: string) =>
    language === 'en'
      ? `Have you seen this market gap yourself, and how would you close it: "${gap}"?`
      : `Jesi li i sam primijetio ovu tržišnu prazninu i kako bi je zatvorio: "${gap}"?`;
  for (const gap of market.gaps ?? []) {
    const question = toQuestion(gap);
    const dedupe = question.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      side: 'general',
      question,
      context: language === 'en' ? `Market research (${market.scope.region})` : `Istraživanje tržišta (${market.scope.region})`,
      source: 'market_gap',
    });
  }
  return out.slice(0, 8);
}

/**
 * Puni skup kandidata za ispitivanje: pitanja iz reakcija persona + rupe iz
 * biznis plana + praznine iz istraživanja tržišta, deduplicirano.
 * Ispitivač (DeepSeek) iz ovoga bira redoslijed.
 */
export function buildCandidateQuestions(
  report: ValidationReport | null,
  knowledge: ProjectKnowledge | null,
  language: 'hr' | 'en',
  market?: MarketIntelligence | null
): DiscoveryQuestion[] {
  const fromReport = report ? buildDiscoveryQuestions(report, language) : [];
  const fromGaps = knowledge ? buildKnowledgeGapQuestions(knowledge, language) : [];
  const fromMarket = market ? buildMarketGapQuestions(market, language) : [];
  const out: DiscoveryQuestion[] = [];
  const seen = new Set<string>();
  for (const item of [...fromMarket, ...fromGaps, ...fromReport]) {
    const key = item.question.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 28);
}
