'use client';

import { useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend, ReferenceLine, ReferenceArea,
} from 'recharts';
import {
  Banknote,
  Building2,
  ClipboardList,
  ExternalLink,
  Landmark,
  Loader2,
  Megaphone,
  MessageSquareText,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ValidationReport, IdeaFormData, PricingAnalysis, ResearchAngle, ResearchReport } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { aiClient } from '@/lib/ai-client';
import { TOKEN_COSTS, formatTokens, spendTokens } from '@/lib/tokens';

const BUY_COLOR = '#22c55e';
const MAYBE_COLOR = '#eab308';
const REJECT_COLOR = '#ef4444';
const ACCENT = '#6366f1';

function spendOrExplain(cost: number, language: 'hr' | 'en', label: string): string | null {
  const spent = spendTokens(cost);
  if (spent.ok) return null;
  return language === 'en'
    ? `${label} needs ${formatTokens(cost)} tokens. Missing ${formatTokens(spent.missing)} tokens. Use Add €10 in the wallet to continue.`
    : `${label} treba ${formatTokens(cost)} tokena. Nedostaje ${formatTokens(spent.missing)} tokena. Klikni Dodaj 10€ u walletu za nastavak.`;
}

interface ScoreRingProps {
  score: number;
  labelTranslation: string;
}

function ScoreRing({ score, labelTranslation }: ScoreRingProps) {
  const color = score >= 60 ? BUY_COLOR : score >= 35 ? MAYBE_COLOR : REJECT_COLOR;
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#27272a" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ / 4}
          transform="rotate(-90 70 70) scale(1,-1) translate(0,-140)"
        />
        <text x="70" y="65" textAnchor="middle" fill="white" fontSize="28" fontWeight="700">{score}</text>
        <text x="70" y="85" textAnchor="middle" fill="#a1a1aa" fontSize="11">/100</text>
      </svg>
      <span className="text-sm font-medium" style={{ color }}>{labelTranslation}</span>
    </div>
  );
}

interface IntentDonutProps {
  intent: ValidationReport['intent'];
  title: string;
  labels: { buy: string; maybe: string; reject: string };
}

function IntentDonut({ intent, title, labels }: IntentDonutProps) {
  const data = [
    { name: labels.buy, value: intent.buy, color: BUY_COLOR },
    { name: labels.maybe, value: intent.maybe, color: MAYBE_COLOR },
    { name: labels.reject, value: intent.reject, color: REJECT_COLOR },
  ];
  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-400 mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
            formatter={(val) => [`${val}%`, '']}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 text-sm">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
            <span className="text-zinc-300">{d.name} <strong className="text-white">{d.value}%</strong></span>
          </span>
        ))}
      </div>
    </div>
  );
}

interface MarketSideResult {
  side: 'payer' | 'user';
  label: string;
  description: string;
  count: number;
  score: number;
  intent: ValidationReport['intent'];
  topReasons: string[];
}

function scoreFromCounts(buy: number, maybe: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.round((buy * 100 + maybe * 40) / total));
}

function buildMarketSideResults(
  report: ValidationReport,
  labels: {
    payer: string;
    payerDesc: string;
    user: string;
    userDesc: string;
  }
): MarketSideResult[] {
  if (!report.personas?.length || !report.reactions?.length) return [];
  const personas = report.personas;
  const reactions = report.reactions;
  const reactionById = new Map(reactions.map((reaction) => [reaction.persona_id, reaction]));

  return ([
    { side: 'payer' as const, label: labels.payer, description: labels.payerDesc },
    { side: 'user' as const, label: labels.user, description: labels.userDesc },
  ]).map((group) => {
    const groupReactions = personas
      .filter((persona) =>
        group.side === 'payer'
          ? persona.market_side === 'payer' || persona.market_side === 'partner' || persona.market_side === 'both'
          : persona.market_side === 'user'
      )
      .map((persona) => reactionById.get(persona.id))
      .filter((reaction): reaction is NonNullable<typeof reaction> => Boolean(reaction));

    const count = groupReactions.length;
    const buy = groupReactions.filter((reaction) => reaction.decision === 'buy').length;
    const maybe = groupReactions.filter((reaction) => reaction.decision === 'maybe').length;
    const reject = count - buy - maybe;
    const reasonCounts = new Map<string, number>();
    groupReactions.forEach((reaction) => {
      const reason = reaction.main_reason?.trim();
      if (reason) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    });

    return {
      ...group,
      count,
      score: scoreFromCounts(buy, maybe, count),
      intent: {
        buy: count ? Math.round((buy / count) * 100) : 0,
        maybe: count ? Math.round((maybe / count) * 100) : 0,
        reject: count ? Math.round((reject / count) * 100) : 0,
      },
      topReasons: [...reasonCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason]) => reason),
    };
  }).filter((group) => group.count > 0);
}

interface MarketSideComparisonProps {
  results: MarketSideResult[];
  labels: {
    buy: string;
    maybe: string;
    reject: string;
    intent: string;
    personas: string;
    topReasons: string;
    scoreLabel: (score: number) => string;
  };
}

function MarketSideComparison({ results, labels }: MarketSideComparisonProps) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {results.map((result) => (
        <div key={result.side} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
            <ScoreRing score={result.score} labelTranslation={labels.scoreLabel(result.score)} />
            <div className="flex-1 min-w-0 w-full">
              <div className="mb-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-white">{result.label}</h3>
                  <span className="text-[10px] text-zinc-500 border border-zinc-700 rounded-full px-2 py-0.5">
                    {result.count} {labels.personas}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{result.description}</p>
              </div>
              <IntentDonut
                intent={result.intent}
                title={labels.intent}
                labels={{ buy: labels.buy, maybe: labels.maybe, reject: labels.reject }}
              />
              {result.topReasons.length > 0 && (
                <div className="mt-3 border-t border-zinc-800 pt-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">{labels.topReasons}</p>
                  <div className="space-y-1">
                    {result.topReasons.map((reason, index) => (
                      <p key={`${reason}-${index}`} className="text-xs text-zinc-300 leading-relaxed">
                        <span className="text-zinc-600">{index + 1}.</span> {reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface DiscoveryQuestion {
  side: 'payer' | 'user' | 'general';
  question: string;
  context?: string;
  source: 'question' | 'objection' | 'doubt';
}

function buildDiscoveryQuestions(report: ValidationReport, language: 'hr' | 'en'): DiscoveryQuestion[] {
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

interface DiscoveryQuestionBoardProps {
  questions: DiscoveryQuestion[];
  labels: {
    title: string;
    subtitle: string;
    payer: string;
    user: string;
    general: string;
    context: string;
    empty: string;
  };
}

function DiscoveryQuestionBoard({ questions, labels }: DiscoveryQuestionBoardProps) {
  const groups = [
    { side: 'payer' as const, label: labels.payer, items: questions.filter((q) => q.side === 'payer') },
    { side: 'user' as const, label: labels.user, items: questions.filter((q) => q.side === 'user') },
    { side: 'general' as const, label: labels.general, items: questions.filter((q) => q.side === 'general') },
  ].filter((group) => group.items.length > 0);

  return (
    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
      <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-2">
        {labels.title}
      </h2>
      <p className="text-xs text-zinc-500 mb-4">{labels.subtitle}</p>
      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">{labels.empty}</p>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {groups.map((group) => (
            <div
              key={group.side}
              className={`rounded-xl border p-4 space-y-3 ${
                group.side === 'payer'
                  ? 'border-emerald-800/40 bg-emerald-950/10'
                  : group.side === 'user'
                  ? 'border-sky-800/40 bg-sky-950/10'
                  : 'border-zinc-800 bg-zinc-950/40 lg:col-span-2'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-white">{group.label}</h3>
                <span className="text-[10px] text-zinc-500 border border-zinc-700 rounded-full px-2 py-0.5">
                  {group.items.length}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.slice(0, group.side === 'general' ? 6 : 10).map((item, index) => (
                  <div key={`${item.question}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-950/55 p-3">
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-900/60 border border-indigo-700/50 flex items-center justify-center text-xs font-bold text-indigo-300">
                        ?
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-100 leading-relaxed font-medium">{item.question}</p>
                        {item.context && (
                          <p className="text-[11px] text-zinc-500 leading-relaxed mt-1">
                            <span className="text-zinc-600">{labels.context}:</span> {item.context}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface ConfidenceCardProps {
  confidence?: ValidationReport['confidence'];
  labels: {
    title: string;
    subtitle: string;
    reasons: string;
    missing: string;
    low: string;
    medium: string;
    high: string;
    fallbackReason: string;
    fallbackMissing: string;
  };
}

function ConfidenceCard({ confidence, labels }: ConfidenceCardProps) {
  const score = Math.max(0, Math.min(100, Math.round(confidence?.score ?? 45)));
  const label = confidence?.label ?? (score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low');
  const color =
    label === 'high'
      ? 'text-emerald-300 border-emerald-800/50 bg-emerald-950/20'
      : label === 'medium'
      ? 'text-amber-300 border-amber-800/50 bg-amber-950/20'
      : 'text-red-300 border-red-900/50 bg-red-950/20';
  const labelText = label === 'high' ? labels.high : label === 'medium' ? labels.medium : labels.low;
  const reasons = confidence?.reasons?.length ? confidence.reasons : [labels.fallbackReason];
  const missing = confidence?.missing_evidence?.length ? confidence.missing_evidence : [labels.fallbackMissing];

  return (
    <section className={`rounded-2xl border p-6 ${color}`}>
      <div className="flex flex-col md:flex-row md:items-start gap-5">
        <div className="md:w-36 flex-shrink-0">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-2">{labels.title}</p>
          <div className="rounded-xl border border-current/25 bg-black/20 p-4 text-center">
            <p className="text-4xl font-black text-white">{score}</p>
            <p className="text-xs text-zinc-400">/100</p>
            <p className="mt-2 text-sm font-bold">{labelText}</p>
          </div>
        </div>
        <div className="flex-1 space-y-4">
          <p className="text-sm text-zinc-300 leading-relaxed">{labels.subtitle}</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">{labels.reasons}</p>
              <ul className="space-y-1.5">
                {reasons.slice(0, 4).map((reason, index) => (
                  <li key={`${reason}-${index}`} className="text-sm text-zinc-200 leading-relaxed flex gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">{labels.missing}</p>
              <ul className="space-y-1.5">
                {missing.slice(0, 5).map((item, index) => (
                  <li key={`${item}-${index}`} className="text-sm text-zinc-200 leading-relaxed flex gap-2">
                    <span className="text-amber-400 mt-0.5">!</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface AudienceRadarProps {
  radar: ValidationReport['target_audience']['radar_data'];
  labels: { tech: string; budget: string; timeSaving: string; risk: string };
}

function AudienceRadar({ radar, labels }: AudienceRadarProps) {
  const data = [
    { axis: labels.tech, value: radar.tech },
    { axis: labels.budget, value: radar.budget },
    { axis: labels.timeSaving, value: radar.time_saving },
    { axis: labels.risk, value: radar.risk },
  ];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="#27272a" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
        <Radar dataKey="value" stroke={ACCENT} fill={ACCENT} fillOpacity={0.2} dot />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
          formatter={(val) => [`${val}/10`, '']}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

interface RejectionBarProps {
  reasons: ValidationReport['rejection']['reasons'];
  tooltipLabel: string;
}

function RejectionBar({ reasons, tooltipLabel }: RejectionBarProps) {
  return (
    <ResponsiveContainer width="100%" height={reasons.length * 52 + 20}>
      <BarChart data={reasons} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="reason" width={160} tick={{ fill: '#d4d4d8', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
          formatter={(val) => [`${val}%`, tooltipLabel]}
        />
        <Bar dataKey="percentage" fill={REJECT_COLOR} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface SegmentComparisonProps {
  segments: NonNullable<ValidationReport['segments']>;
  labels: { personas: string; winner: string; buy: string; maybe: string; reject: string };
}

function SegmentComparison({ segments, labels }: SegmentComparisonProps) {
  const topScore = Math.max(...segments.map((s) => s.score));
  return (
    <div className="space-y-3">
      {segments.map((s, i) => {
        const color = s.score >= 60 ? BUY_COLOR : s.score >= 35 ? MAYBE_COLOR : REJECT_COLOR;
        const isWinner = s.score === topScore && segments.length > 1;
        return (
          <div
            key={`${s.label}-${i}`}
            className={`rounded-xl border p-4 ${isWinner ? 'border-emerald-600/50 bg-emerald-950/10' : 'border-zinc-800 bg-zinc-950/40'}`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-white text-sm">{s.label}</h4>
                  {isWinner && (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 rounded-full px-2 py-0.5">
                      ★ {labels.winner}
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-500">
                    {s.personas_count} {labels.personas}
                  </span>
                </div>
                {s.description && <p className="text-xs text-zinc-500 mt-0.5">{s.description}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-2xl font-extrabold leading-none" style={{ color }}>
                  {s.score}
                </div>
                <div className="text-[10px] text-zinc-600">/100</div>
              </div>
            </div>

            {/* Stacked intent bar */}
            <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800 mb-1.5">
              <div style={{ width: `${s.intent.buy}%`, background: BUY_COLOR }} />
              <div style={{ width: `${s.intent.maybe}%`, background: MAYBE_COLOR }} />
              <div style={{ width: `${s.intent.reject}%`, background: REJECT_COLOR }} />
            </div>
            <div className="flex gap-3 text-[10px] text-zinc-500 mb-2">
              <span><span className="text-green-500">●</span> {labels.buy} {s.intent.buy}%</span>
              <span><span className="text-yellow-500">●</span> {labels.maybe} {s.intent.maybe}%</span>
              <span><span className="text-red-500">●</span> {labels.reject} {s.intent.reject}%</span>
            </div>

            {s.verdict && <p className="text-xs text-zinc-300 leading-relaxed">{s.verdict}</p>}
            {s.top_reason && (
              <p className="text-[11px] text-zinc-500 mt-1.5">
                <span className="text-zinc-600">↳</span> {s.top_reason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface PricingLabels {
  title: string;
  subtitle: string;
  run: string;
  running: string;
  needData: string;
  range: string;
  optimal: string;
  yourPrice: string;
  na: string;
  sample: string;
  tooCheap: string;
  cheap: string;
  expensive: string;
  tooExpensive: string;
  error: string;
}

interface PricingSectionProps {
  report: ValidationReport;
  form?: IdeaFormData | null;
  language: 'hr' | 'en';
  onUpdateReport?: (r: ValidationReport) => void;
  labels: PricingLabels;
}

function PricingSection({ report, form, language, onUpdateReport, labels }: PricingSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localPricing, setLocalPricing] = useState<PricingAnalysis | null>(null);
  const pricing = report.pricing ?? localPricing;

  const hasPersonas = (report.personas?.length ?? 0) > 0;
  const canRun = !!form?.price_model && hasPersonas;

  const run = async () => {
    if (!form || loading) return;
    const tokenError = spendOrExplain(TOKEN_COSTS.tool_light, language, labels.title);
    if (tokenError) {
      setError(tokenError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await aiClient.runPricing<{ pricing: PricingAnalysis }>(
        { idea: form, personas: report.personas, reactions: report.reactions, language },
        labels.error
      );
      if (onUpdateReport) onUpdateReport({ ...report, pricing: data.pricing });
      else setLocalPricing(data.pricing);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.error);
    } finally {
      setLoading(false);
    }
  };

  const money = (v: number) => `${v}${pricing?.currency ?? ''}${pricing?.unit ?? ''}`;
  const cur = pricing?.currency ?? '';

  return (
    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
      <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-2">💰 {labels.title}</h2>
      <p className="text-xs text-zinc-500 mb-4">{labels.subtitle}</p>

      {!pricing ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <button
            onClick={run}
            disabled={!canRun || loading}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {labels.running}
              </>
            ) : (
              <>📈 {labels.run}</>
            )}
          </button>
          {!canRun && <p className="text-xs text-zinc-600 text-center max-w-sm">{labels.needData}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary brojke */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-indigo-400 mb-1">{labels.range}</p>
              <p className="text-sm font-bold text-white">
                {money(pricing.range.low)} – {money(pricing.range.high)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">{labels.optimal}</p>
              <p className="text-sm font-bold text-white">~{money(pricing.opp)}</p>
            </div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-950/40 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">{labels.yourPrice}</p>
              <p className="text-sm font-bold text-white">
                {pricing.current_price != null ? money(pricing.current_price) : labels.na}
              </p>
            </div>
          </div>

          {/* Verdikt */}
          <p className="text-sm text-zinc-200 leading-relaxed bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-4 py-3">
            {pricing.verdict}
          </p>
          {pricing.sample_label && (
            <p className="text-xs text-zinc-500">
              {labels.sample}: <span className="text-zinc-300">{pricing.sample_size}</span> · {pricing.sample_label}
            </p>
          )}

          {/* Van Westendorp graf */}
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={pricing.curve} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="price"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                tickFormatter={(v) => `${cur}${v}`}
              />
              <YAxis domain={[0, 100]} tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                formatter={(v) => [`${v}%`, '']}
                labelFormatter={(l) => `${cur}${l}${pricing.unit}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceArea x1={pricing.range.low} x2={pricing.range.high} fill={ACCENT} fillOpacity={0.08} />
              <ReferenceLine x={pricing.opp} stroke="#22c55e" strokeDasharray="4 2" />
              {pricing.current_price != null && (
                <ReferenceLine x={pricing.current_price} stroke="#f4f4f5" strokeDasharray="2 2" />
              )}
              <Line type="monotone" dataKey="too_cheap" name={labels.tooCheap} stroke="#38bdf8" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="cheap" name={labels.cheap} stroke="#22c55e" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="expensive" name={labels.expensive} stroke="#eab308" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="too_expensive" name={labels.tooExpensive} stroke="#ef4444" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-zinc-600 text-center">
            {pricing.sample_size} {labels.sample} · OPP {money(pricing.opp)} · IPP {money(pricing.ipp)}
          </p>
        </div>
      )}
    </section>
  );
}

interface InterviewLabels {
  title: string;
  subtitle: string;
  run: string;
  running: string;
  needData: string;
  who: string;
  where: string;
  tests: string;
  listen: string;
  copy: string;
  copied: string;
  error: string;
}

interface InterviewSectionProps {
  report: ValidationReport;
  form?: IdeaFormData | null;
  language: 'hr' | 'en';
  onUpdateReport?: (r: ValidationReport) => void;
  labels: InterviewLabels;
}

function InterviewSection({ report, form, language, onUpdateReport, labels }: InterviewSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [localKit, setLocalKit] = useState<ValidationReport['interview'] | null>(null);
  const kit = report.interview ?? localKit;

  const run = async () => {
    if (!form || loading) return;
    const tokenError = spendOrExplain(TOKEN_COSTS.tool_light, language, labels.title);
    if (tokenError) {
      setError(tokenError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const context = {
        summary: report.summary,
        audience: report.target_audience?.profile,
        assumption: report.target_audience?.assumption_vs_reality,
        rejection_reasons: report.rejection?.reasons?.map((r) => r.reason),
        top_questions: report.top_questions,
        segments: report.segments?.map((s) => ({ label: s.label, score: s.score })),
      };
      const data = await aiClient.buildInterview<{ interview: ValidationReport['interview'] }>(
        { idea: form, context, language },
        labels.error
      );
      if (onUpdateReport) onUpdateReport({ ...report, interview: data.interview });
      else setLocalKit(data.interview);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.error);
    } finally {
      setLoading(false);
    }
  };

  const copyScript = () => {
    if (!kit) return;
    const text = [
      `${labels.who}: ${kit.who_to_interview}`,
      `${labels.where}: ${kit.where_to_find.join(', ')}`,
      '',
      ...kit.questions.map((q, i) => `${i + 1}. ${q.question}\n   (${labels.listen}: ${q.listen_for})`),
      '',
      `⚠ ${kit.avoid}`,
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
      <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-2">🎤 {labels.title}</h2>
      <p className="text-xs text-zinc-500 mb-4">{labels.subtitle}</p>

      {!kit ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <button
            onClick={run}
            disabled={!form || loading}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {labels.running}
              </>
            ) : (
              <>📝 {labels.run}</>
            )}
          </button>
          {!form && <p className="text-xs text-zinc-600 text-center max-w-sm">{labels.needData}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tko + gdje */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-indigo-400 mb-1">{labels.who}</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{kit.who_to_interview}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-indigo-400 mb-1.5">{labels.where}</p>
              <div className="flex flex-wrap gap-1.5">
                {kit.where_to_find.map((w, i) => (
                  <span key={i} className="text-[10px] text-zinc-300 bg-zinc-800/70 border border-zinc-700/50 rounded-full px-2 py-0.5">
                    {w}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Pitanja */}
          <ol className="space-y-3">
            {kit.questions.map((q, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-900/60 border border-indigo-700/50 flex items-center justify-center text-xs font-bold text-indigo-300">
                  {i + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-zinc-100 leading-relaxed font-medium">{q.question}</p>
                  {q.why && (
                    <p className="text-[11px] text-zinc-500">
                      <span className="text-zinc-600 uppercase tracking-wide">{labels.tests}:</span> {q.why}
                    </p>
                  )}
                  {q.listen_for && (
                    <p className="text-[11px] text-emerald-400/80">
                      <span className="text-emerald-600/80 uppercase tracking-wide">{labels.listen}:</span> {q.listen_for}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* Avoid + copy */}
          {kit.avoid && (
            <div className="rounded-lg border border-amber-900/30 bg-amber-950/15 px-4 py-2.5 text-xs text-amber-200/90 flex items-start gap-2">
              <span className="text-amber-400">⚠</span> {kit.avoid}
            </div>
          )}
          <button
            onClick={copyScript}
            className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
          >
            {copied ? labels.copied : labels.copy}
          </button>
        </div>
      )}
    </section>
  );
}

interface ConversionLabels {
  title: string;
  subtitle: string;
  run: string;
  running: string;
  needData: string;
  addresses: string;
  impact: string;
  effortLabel: string;
  effortLow: string;
  effortMed: string;
  effortHigh: string;
  error: string;
}

interface StrategyLabels {
  title: string;
  subtitle: string;
  run: string;
  running: string;
  needData: string;
  error: string;
  modes: Record<'go_bigger' | 'tighten_wedge' | 'fix_objections' | 'prepare_launch', { title: string; desc: string }>;
  recommendation: string;
  strategicRead: string;
  doNow: string;
  notNow: string;
  nextSprint: string;
  risks: string;
  decisions: string;
  priority: string;
}

interface StrategySectionProps {
  report: ValidationReport;
  form?: IdeaFormData | null;
  language: 'hr' | 'en';
  onUpdateReport?: (r: ValidationReport) => void;
  labels: StrategyLabels;
}

function StrategySection({ report, form, language, onUpdateReport, labels }: StrategySectionProps) {
  const [mode, setMode] = useState<'go_bigger' | 'tighten_wedge' | 'fix_objections' | 'prepare_launch'>(report.strategy?.mode ?? 'tighten_wedge');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localStrategy, setLocalStrategy] = useState<ValidationReport['strategy'] | null>(null);
  const strategy = report.strategy ?? localStrategy;

  const run = async () => {
    if (!form || loading) return;
    const tokenError = spendOrExplain(TOKEN_COSTS.tool_light, language, labels.title);
    if (tokenError) {
      setError(tokenError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const context = {
        score: report.score,
        summary: report.summary,
        intent: report.intent,
        confidence: report.confidence,
        target_audience: report.target_audience,
        rejection: report.rejection,
        top_questions: report.top_questions,
        action_plan: report.action_plan,
        opportunity: report.opportunity,
        segments: report.segments,
      };
      const data = await aiClient.buildStrategy<{ strategy: ValidationReport['strategy'] }>(
        { idea: form, report: context, mode, language },
        labels.error
      );
      if (onUpdateReport) onUpdateReport({ ...report, strategy: data.strategy });
      else setLocalStrategy(data.strategy);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.error);
    } finally {
      setLoading(false);
    }
  };

  const priorityClass = (priority: 'low' | 'medium' | 'high') => ({
    low: 'border-zinc-700 text-zinc-300',
    medium: 'border-amber-800/60 text-amber-300 bg-amber-950/20',
    high: 'border-red-900/60 text-red-300 bg-red-950/20',
  })[priority];

  return (
    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
      <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-2">🧭 {labels.title}</h2>
      <p className="text-xs text-zinc-500 mb-4">{labels.subtitle}</p>

      <div className="grid md:grid-cols-4 gap-2 mb-4">
        {(Object.keys(labels.modes) as Array<keyof StrategyLabels['modes']>).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
              mode === key
                ? 'border-indigo-500 bg-indigo-950/30'
                : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
            }`}
          >
            <span className="block text-sm font-semibold text-white">{labels.modes[key].title}</span>
            <span className="block text-[11px] text-zinc-500 leading-relaxed mt-1">{labels.modes[key].desc}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3 py-2">
        <button
          onClick={run}
          disabled={!form || loading}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {labels.running}
            </>
          ) : (
            <>🧭 {labels.run}</>
          )}
        </button>
        {!form && <p className="text-xs text-zinc-600 text-center max-w-sm">{labels.needData}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {strategy && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-4">
            <p className="text-[10px] uppercase tracking-wider text-indigo-300 mb-1">{labels.recommendation}</p>
            <p className="text-sm font-semibold text-white leading-relaxed">{strategy.recommendation}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{labels.strategicRead}</p>
            <p className="text-sm text-zinc-200 leading-relaxed">{strategy.strategic_read}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4">
              <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide mb-2">{labels.doNow}</p>
              <ul className="space-y-1.5">
                {strategy.accepted_scope.map((item, index) => (
                  <li key={`${item}-${index}`} className="text-sm text-zinc-200 flex gap-2 leading-relaxed">
                    <span className="text-emerald-400">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{labels.notNow}</p>
              <ul className="space-y-1.5">
                {strategy.not_in_scope.map((item, index) => (
                  <li key={`${item}-${index}`} className="text-sm text-zinc-300 flex gap-2 leading-relaxed">
                    <span className="text-zinc-600">×</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">{labels.nextSprint}</p>
            <div className="grid gap-2">
              {strategy.next_tasks.map((task, index) => (
                <div key={`${task.title}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-white">{task.title}</p>
                    <span className={`text-[10px] border rounded-full px-2 py-0.5 ${priorityClass(task.priority)}`}>
                      {labels.priority}: {task.priority}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{task.details}</p>
                  <p className="text-[10px] text-zinc-600 mt-2 uppercase tracking-wide">{task.owner}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-4">
              <p className="text-xs font-semibold text-red-300 uppercase tracking-wide mb-2">{labels.risks}</p>
              <ul className="space-y-1.5">
                {strategy.risks.map((item, index) => (
                  <li key={`${item}-${index}`} className="text-sm text-zinc-300 leading-relaxed">! {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 p-4">
              <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide mb-2">{labels.decisions}</p>
              <ul className="space-y-1.5">
                {strategy.open_decisions.map((item, index) => (
                  <li key={`${item}-${index}`} className="text-sm text-zinc-300 leading-relaxed">? {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface ResearchLabels {
  title: string;
  subtitle: string;
  run: string;
  running: string;
  needData: string;
  error: string;
  customPlaceholder: string;
  latest: string;
  findings: string;
  sources: string;
  query: string;
  angles: Record<ResearchAngle, { title: string; desc: string }>;
}

interface ResearchSectionProps {
  report: ValidationReport;
  form?: IdeaFormData | null;
  language: 'hr' | 'en';
  onUpdateReport?: (r: ValidationReport) => void;
  labels: ResearchLabels;
}

const researchIcons: Partial<Record<ResearchAngle, LucideIcon>> = {
  competitors: Building2,
  pricing: Banknote,
  voice_of_customer: Megaphone,
  demand: TrendingUp,
  grants: Landmark,
  funding: Search,
  local_growth: Store,
  custom: Search,
};

function ResearchSection({ report, form, language, onUpdateReport, labels }: ResearchSectionProps) {
  const presets: ResearchAngle[] = ['competitors', 'pricing', 'demand', 'grants', 'funding', 'local_growth', 'voice_of_customer'];
  const [activeAngle, setActiveAngle] = useState<ResearchAngle>('competitors');
  const [customQuery, setCustomQuery] = useState('');
  const [loadingAngle, setLoadingAngle] = useState<ResearchAngle | null>(null);
  const [error, setError] = useState('');
  const [localReports, setLocalReports] = useState<ResearchReport[]>([]);
  const reports = report.research_reports?.length ? report.research_reports : localReports;
  const latest = reports[0];

  const run = async (angle: ResearchAngle) => {
    if (!form || loadingAngle) return;
    if (angle === 'custom' && !customQuery.trim()) return;

    setActiveAngle(angle);
    const tokenError = spendOrExplain(TOKEN_COSTS.tool_research, language, labels.angles[angle].title);
    if (tokenError) {
      setError(tokenError);
      return;
    }
    setLoadingAngle(angle);
    setError('');

    try {
      const data = await aiClient.runResearch<{ report: ResearchReport }>({
          idea: form,
          angle,
          query: angle === 'custom' ? customQuery.trim() : undefined,
          language,
        },
        labels.error
      );
      const nextReports = [data.report as ResearchReport, ...reports.filter((item) => item.query !== data.report.query)].slice(0, 8);
      if (onUpdateReport) onUpdateReport({ ...report, research_reports: nextReports });
      else setLocalReports(nextReports);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.error);
    } finally {
      setLoadingAngle(null);
    }
  };

  return (
    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
      <h2 className="text-xl font-black text-cyan-100 tracking-normal md:text-2xl mb-2">{labels.title}</h2>
      <p className="text-xs text-zinc-500 mb-4">{labels.subtitle}</p>

      <div className="grid md:grid-cols-3 gap-2 mb-4">
        {presets.map((angle) => {
          const Icon = researchIcons[angle] ?? Search;
          const isLoading = loadingAngle === angle;
          return (
            <button
              key={angle}
              type="button"
              onClick={() => run(angle)}
              disabled={!form || Boolean(loadingAngle)}
              className={`rounded-xl border p-3 text-left transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                activeAngle === angle
                  ? 'border-cyan-500 bg-cyan-950/25'
                  : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 text-cyan-300" />}
                {labels.angles[angle].title}
              </span>
              <span className="block text-[11px] text-zinc-500 leading-relaxed mt-1">{labels.angles[angle].desc}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col md:flex-row gap-2">
        <input
          value={customQuery}
          onChange={(event) => setCustomQuery(event.target.value)}
          placeholder={labels.customPlaceholder}
          className="min-w-0 flex-1 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
        />
        <button
          type="button"
          onClick={() => run('custom')}
          disabled={!form || !customQuery.trim() || Boolean(loadingAngle)}
          className="rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 disabled:text-zinc-600 px-4 py-2 text-sm font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loadingAngle === 'custom' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loadingAngle === 'custom' ? labels.running : labels.run}
        </button>
      </div>

      {!form && <p className="text-xs text-zinc-600 text-center mt-3">{labels.needData}</p>}
      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

      {latest && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-[10px] uppercase tracking-wider text-cyan-300">{labels.latest}: {labels.angles[latest.angle].title}</p>
              <p className="text-[10px] text-zinc-600">{labels.query}: {latest.query}</p>
            </div>
            <p className="text-sm text-zinc-100 leading-relaxed">{latest.summary}</p>
          </div>

          {latest.findings.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">{labels.findings}</p>
              <div className="grid gap-2">
                {latest.findings.map((finding, index) => (
                  <div key={`${finding.point}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                    <p className="text-sm font-medium text-white leading-relaxed">{finding.point}</p>
                    {finding.detail && <p className="text-xs text-zinc-500 leading-relaxed mt-1">{finding.detail}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {latest.sources.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">{labels.sources}</p>
              <div className="grid md:grid-cols-2 gap-2">
                {latest.sources.map((source, index) => (
                  <a
                    key={`${source.url}-${index}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 hover:border-cyan-800/70 transition-colors"
                  >
                    <span className="flex items-start gap-2 text-sm font-medium text-zinc-100 leading-snug">
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                      {source.title}
                    </span>
                    {source.snippet && <span className="block text-xs text-zinc-500 leading-relaxed mt-1">{source.snippet}</span>}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

type CommandTool =
  | 'strategy'
  | 'research_grants'
  | 'research_funding'
  | 'research_competitors'
  | 'research_local_growth'
  | 'pricing'
  | 'interview'
  | 'conversion'
  | 'angles';

interface CommandCenterLabels {
  title: string;
  subtitle: string;
  primaryHint: string;
  quickStart: string;
  recommended: string;
  recommendedHelp: string;
  allTools: string;
  allToolsHelp: string;
  recentResult: string;
  inputPlaceholder: string;
  run: string;
  running: string;
  needData: string;
  error: string;
  result: string;
  showAllTools: string;
  hideAllTools: string;
  toolTitles: Record<CommandTool, string>;
  toolDescriptions: Record<CommandTool, string>;
  routedTo: string;
  noMatch: string;
}

interface CommandCenterProps {
  report: ValidationReport;
  form?: IdeaFormData | null;
  language: 'hr' | 'en';
  showToolShelf: boolean;
  setShowToolShelf: (value: boolean) => void;
  onUpdateReport?: (r: ValidationReport) => void;
  labels: CommandCenterLabels;
}

const commandIcons: Record<CommandTool, LucideIcon> = {
  strategy: Target,
  research_grants: Landmark,
  research_funding: Search,
  research_competitors: Building2,
  research_local_growth: Store,
  pricing: Banknote,
  interview: MessageSquareText,
  conversion: Wrench,
  angles: Megaphone,
};

const allCommandTools: CommandTool[] = [
  'strategy',
  'research_grants',
  'research_funding',
  'research_competitors',
  'research_local_growth',
  'pricing',
  'interview',
  'conversion',
  'angles',
];

interface CommandRecommendation {
  tool: CommandTool;
  reason: string;
  score: number;
}

function inferCommandTool(
  input: string,
  form: IdeaFormData | null | undefined,
  report: ValidationReport,
  language: 'hr' | 'en'
): CommandTool {
  const text = input.toLowerCase();
  if (/potic|grant|subvenc|fondovi|eu|držav|drzav|incentive|subsid/.test(text)) return 'research_grants';
  if (/vc|invest|angel|funding|kapital|akcelerator|accelerator|seed/.test(text)) return 'research_funding';
  if (/lokal|širen|siren|zona|grad|kvart|poslovnic|dostav|kapacitet|repeat|preporuk/.test(text)) return 'research_local_growth';
  if (/konkur|alternativ|competitor|competition/.test(text)) return 'research_competitors';
  if (/cijen|pricing|price|naplat|pretplat/.test(text)) return 'pricing';
  if (/intervju|razgovor|pitanj|customer discovery|mom test/.test(text)) return 'interview';
  if (/prigovor|odbij|conversion|preokret|skeptik|blok/.test(text)) return 'conversion';
  if (/marketing|poruk|hook|oglas|kanal|angle|kut/.test(text)) return 'angles';
  if (/strateg|plan|sljede|next|sprint|što dalje|sto dalje/.test(text)) return 'strategy';
  return getCommandRecommendations(report, form, language)[0]?.tool ?? 'strategy';
}

function businessSignals(form?: IdeaFormData | null) {
  const category = `${form?.inferred_category || ''} ${form?.elevator_pitch || ''}`.toLowerCase();
  const startupish = form?.business_model === 'B2B' || /startup|saas|fintech|it|platform|app|software|softver/.test(category);
  const localish = /lokal|uslug|trgovin|restoran|salon|monta|prozora|obrt|dostav|servis/.test(category);
  return { startupish, localish };
}

function getCommandRecommendations(
  report: ValidationReport,
  form: IdeaFormData | null | undefined,
  language: 'hr' | 'en'
): CommandRecommendation[] {
  const { startupish, localish } = businessSignals(form);
  const hasResearch = (angle: ResearchAngle) => report.research_reports?.some((item) => item.angle === angle);
  const confidenceScore = report.confidence?.score ?? 45;
  const hasMissingEvidence = (report.confidence?.missing_evidence?.length ?? 0) > 0;
  const rejectionIsHigh = report.intent.reject >= 35 || report.score < 45;
  const maybeIsHigh = report.intent.maybe >= 35;
  const manyQuestions = (report.top_questions?.length ?? 0) >= 4;
  const hasClusters = (report.clusters?.length ?? 0) > 0;

  const reason = {
    hr: {
      strategy: report.strategy ? 'Strategija već postoji, ali možeš je osvježiti za novi sprint.' : 'Treba jasan sljedeći sprint iz trenutnih nalaza.',
      grants: hasResearch('grants') ? 'Poticaji su već istraženi, korisno za provjeru novih programa.' : 'Vrijedi provjeriti poticaje jer mogu promijeniti plan financiranja.',
      funding: hasResearch('funding') ? 'Funding put je već mapiran, možeš ga nadopuniti novim upitom.' : 'Startup signal je jak, pa treba provjeriti realan put do kapitala.',
      competitors: hasResearch('competitors') ? 'Konkurencija je već istražena, ali može se suziti po tržištu.' : 'Fali stvarni pogled na alternative i tržišne praznine.',
      localGrowth: hasResearch('local_growth') ? 'Lokalni rast je već istražen, možeš provjeriti drugu zonu.' : 'Ovo izgleda kao lokalni/proizvodni rast gdje je zona i kapacitet bitan.',
      pricing: report.pricing ? 'Cijena je već analizirana, ali možeš je ponoviti nakon promjene ponude.' : 'Cijena je jedna od najbržih stvari za testirati prije prodaje.',
      interview: report.interview ? 'Intervju kit već postoji, sljedeće ga možeš doraditi po segmentu.' : 'Confidence traži stvarne razgovore, ne još samo sintetičke signale.',
      conversion: report.conversion ? 'Plan preokreta već postoji, možeš ga osvježiti nakon novih odgovora.' : 'Visok otpor znači da treba maknuti najveće prigovore.',
      angles: report.angles ? 'Marketinški kutevi već postoje, možeš ih doraditi po kanalu.' : 'Postoje segmenti i prigovori koje treba pretvoriti u poruke.',
    },
    en: {
      strategy: report.strategy ? 'Strategy exists, but it can be refreshed for the next sprint.' : 'The current findings need a clear next sprint.',
      grants: hasResearch('grants') ? 'Grants were already researched, useful for checking new programs.' : 'Grants could change the financing path, so they are worth checking.',
      funding: hasResearch('funding') ? 'Funding path is mapped, but you can refine it with a narrower query.' : 'Startup signal is strong, so the realistic path to capital matters.',
      competitors: hasResearch('competitors') ? 'Competitors were researched, but this can be narrowed by market.' : 'Real alternatives and market gaps are still missing.',
      localGrowth: hasResearch('local_growth') ? 'Local growth was researched, try another zone or channel.' : 'This looks like local/product growth where zone and capacity matter.',
      pricing: report.pricing ? 'Pricing exists, but rerun it after an offer change.' : 'Pricing is one of the fastest things to test before selling.',
      interview: report.interview ? 'Interview kit exists, refine it by segment next.' : 'Confidence needs real conversations, not only synthetic signals.',
      conversion: report.conversion ? 'Conversion plan exists, refresh it after new answers.' : 'High resistance means the biggest objections need to be removed.',
      angles: report.angles ? 'Marketing angles exist, refine them by channel.' : 'Segments and objections should become messages.',
    },
  }[language];

  const candidates: CommandRecommendation[] = [
    { tool: 'strategy', score: 55 + (report.strategy ? -12 : 10) + (report.score < 60 ? 10 : 0), reason: reason.strategy },
    { tool: 'research_competitors', score: 44 + (hasResearch('competitors') ? -18 : 16) + (!form?.competitors ? 8 : 0), reason: reason.competitors },
    { tool: 'pricing', score: 38 + (report.pricing ? -18 : 16) + (form?.price_model ? 8 : 0) + (maybeIsHigh ? 6 : 0), reason: reason.pricing },
    { tool: 'interview', score: 38 + (report.interview ? -18 : 16) + (confidenceScore < 60 ? 12 : 0) + (hasMissingEvidence ? 8 : 0) + (manyQuestions ? 8 : 0), reason: reason.interview },
    { tool: 'conversion', score: 36 + (report.conversion ? -16 : 16) + (rejectionIsHigh ? 18 : 0), reason: reason.conversion },
    { tool: 'angles', score: 28 + (report.angles ? -16 : 12) + (hasClusters ? 10 : 0) + (report.score >= 35 ? 6 : 0), reason: reason.angles },
    { tool: 'research_grants', score: 26 + (hasResearch('grants') ? -14 : 14) + (startupish || localish ? 12 : 0), reason: reason.grants },
    { tool: 'research_funding', score: 22 + (hasResearch('funding') ? -16 : 16) + (startupish ? 24 : -8), reason: reason.funding },
    { tool: 'research_local_growth', score: 22 + (hasResearch('local_growth') ? -16 : 16) + (localish ? 26 : -6), reason: reason.localGrowth },
  ];

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function CommandCenter({ report, form, language, showToolShelf, setShowToolShelf, onUpdateReport, labels }: CommandCenterProps) {
  const [command, setCommand] = useState('');
  const [loadingTool, setLoadingTool] = useState<CommandTool | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const recommendations = getCommandRecommendations(report, form, language);
  const recommendationByTool = new Map(recommendations.map((item) => [item.tool, item]));
  const visibleTools = showToolShelf ? allCommandTools : recommendations.map((item) => item.tool);

  const mergeReport = (patch: Partial<ValidationReport>) => {
    if (onUpdateReport) onUpdateReport({ ...report, ...patch });
  };

  const runResearch = async (tool: CommandTool, angle: ResearchAngle, query?: string) => {
    const data = await aiClient.runResearch<{ report: ResearchReport }>(
      { idea: form, angle, query, language },
      labels.error
    );
    const existing = report.research_reports ?? [];
    const nextReports = [data.report as ResearchReport, ...existing.filter((item) => item.query !== data.report.query)].slice(0, 8);
    mergeReport({ research_reports: nextReports });
    setResult(data.report.summary || `${labels.routedTo} ${labels.toolTitles[tool]}`);
  };

  const runTool = async (tool: CommandTool, rawCommand = command) => {
    if (!form || loadingTool) return;
    const cost = tool.startsWith('research_') ? TOKEN_COSTS.tool_research : TOKEN_COSTS.tool_light;
    const tokenError = spendOrExplain(cost, language, labels.toolTitles[tool]);
    if (tokenError) {
      setError(tokenError);
      return;
    }
    setLoadingTool(tool);
    setError('');
    setResult('');

    try {
      if (tool === 'research_grants') {
        await runResearch(tool, 'grants', rawCommand.trim() || undefined);
      } else if (tool === 'research_funding') {
        await runResearch(tool, 'funding', rawCommand.trim() || undefined);
      } else if (tool === 'research_competitors') {
        await runResearch(tool, 'competitors', rawCommand.trim() || undefined);
      } else if (tool === 'research_local_growth') {
        await runResearch(tool, 'local_growth', rawCommand.trim() || undefined);
      } else if (tool === 'strategy') {
        const context = {
          score: report.score,
          summary: report.summary,
          intent: report.intent,
          confidence: report.confidence,
          target_audience: report.target_audience,
          rejection: report.rejection,
          top_questions: report.top_questions,
          action_plan: report.action_plan,
          opportunity: report.opportunity,
          segments: report.segments,
        };
        const data = await aiClient.buildStrategy<{ strategy: NonNullable<ValidationReport['strategy']> }>(
          { idea: form, report: context, mode: 'tighten_wedge', language },
          labels.error
        );
        mergeReport({ strategy: data.strategy });
        setResult(data.strategy.recommendation);
      } else if (tool === 'pricing') {
        const data = await aiClient.runPricing<{ pricing: PricingAnalysis }>(
          { idea: form, personas: report.personas, reactions: report.reactions, language },
          labels.error
        );
        mergeReport({ pricing: data.pricing });
        setResult(`${labels.routedTo} ${labels.toolTitles.pricing}`);
      } else if (tool === 'interview') {
        const data = await aiClient.buildInterview<{ interview: NonNullable<ValidationReport['interview']> }>(
          { idea: form, report: { top_questions: report.top_questions, rejection: report.rejection, target_audience: report.target_audience }, language },
          labels.error
        );
        mergeReport({ interview: data.interview });
        setResult(data.interview?.who_to_interview || `${labels.routedTo} ${labels.toolTitles.interview}`);
      } else if (tool === 'conversion') {
        const context = {
          intent: report.intent,
          rejection_reasons: report.rejection?.reasons,
          quotes: report.rejection?.quotes,
          top_questions: report.top_questions,
          personas: report.personas,
          reactions: report.reactions,
        };
        const data = await aiClient.buildConversion<{ conversion: NonNullable<ValidationReport['conversion']> }>(
          { idea: form, context, language },
          labels.error
        );
        mergeReport({ conversion: data.conversion });
        setResult(data.conversion?.summary || `${labels.routedTo} ${labels.toolTitles.conversion}`);
      } else if (tool === 'angles') {
        const context = {
          clusters: report.clusters,
          opportunity: report.opportunity,
          target_audience: report.target_audience,
          rejection: report.rejection,
        };
        const data = await aiClient.buildAngles<{ angles: NonNullable<ValidationReport['angles']> }>(
          { idea: form, context, language },
          labels.error
        );
        mergeReport({ angles: data.angles });
        setResult(`${labels.routedTo} ${labels.toolTitles.angles}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.error);
    } finally {
      setLoadingTool(null);
    }
  };

  const submitCommand = () => {
    const trimmed = command.trim();
    if (!trimmed) return;
    const tool = inferCommandTool(trimmed, form, report, language);
    void runTool(tool, trimmed);
  };

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-cyan-900/50 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),linear-gradient(135deg,#0b1120_0%,#09090b_48%,#061214_100%)] p-5 md:p-7 shadow-[0_24px_90px_rgba(8,145,178,0.16)]">
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="relative space-y-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_220px] lg:items-start">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-950/25 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" />
              {labels.title}
            </div>
            <h2 className="max-w-3xl text-2xl font-black tracking-tight text-white md:text-4xl">
              {labels.primaryHint}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">{labels.subtitle}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">{labels.quickStart}</p>
            <p className="mt-2 text-4xl font-black text-white">
              {report.score}<span className="text-base text-zinc-500">/100</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">{labels.recommended}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-500/20 bg-black/35 p-2 shadow-inner shadow-black/40">
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitCommand();
              }}
              placeholder={labels.inputPlaceholder}
              className="min-w-0 flex-1 rounded-xl border border-transparent bg-zinc-950/80 px-4 py-4 text-base text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-500/70"
            />
            <button
              type="button"
              onClick={submitCommand}
              disabled={!form || !command.trim() || Boolean(loadingTool)}
              className="rounded-xl bg-cyan-300 px-6 py-4 text-sm font-black text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 md:min-w-36 flex items-center justify-center gap-2"
            >
              {loadingTool ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              {loadingTool ? labels.running : labels.run}
            </button>
          </div>
        </div>

        {!form && <p className="text-xs text-zinc-600">{labels.needData}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {result && (
          <div className="rounded-2xl border border-cyan-500/25 bg-cyan-950/20 p-4">
            <p className="text-[10px] uppercase tracking-widest text-cyan-300">{labels.recentResult}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-100">{result}</p>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                {showToolShelf ? `${labels.allTools} (${allCommandTools.length})` : `${labels.recommended} (${recommendations.length})`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                {showToolShelf ? labels.allToolsHelp : labels.recommendedHelp}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowToolShelf(!showToolShelf)}
              className="rounded-full border border-zinc-700/80 bg-zinc-950/60 px-3 py-1.5 text-xs font-bold text-zinc-300 transition-colors hover:border-cyan-700 hover:text-cyan-200"
            >
              {showToolShelf ? labels.hideAllTools : `${labels.showAllTools} (${allCommandTools.length})`}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {visibleTools.map((tool, index) => {
              const Icon = commandIcons[tool];
              const isLoading = loadingTool === tool;
              const detail = showToolShelf
                ? labels.toolDescriptions[tool]
                : recommendationByTool.get(tool)?.reason ?? labels.toolDescriptions[tool];
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => runTool(tool)}
                  disabled={!form || Boolean(loadingTool)}
                  className={`group min-h-[118px] rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                    showToolShelf
                      ? 'border-zinc-800 bg-zinc-950/45 hover:border-cyan-800/80'
                      : index === 0
                        ? 'border-cyan-500/40 bg-cyan-950/20 hover:border-cyan-300/70'
                        : 'border-zinc-800 bg-zinc-950/45 hover:border-cyan-800/80'
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-black text-white">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : <Icon className="h-4 w-4 text-cyan-300" />}
                      {labels.toolTitles[tool]}
                    </span>
                    {!showToolShelf && index === 0 && (
                      <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[10px] font-black text-zinc-950">1</span>
                    )}
                  </span>
                  <span className="mt-3 block text-xs leading-relaxed text-zinc-400 group-hover:text-zinc-300">{detail}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

interface ConversionSectionProps {
  report: ValidationReport;
  form?: IdeaFormData | null;
  language: 'hr' | 'en';
  onUpdateReport?: (r: ValidationReport) => void;
  labels: ConversionLabels;
}

function ConversionSection({ report, form, language, onUpdateReport, labels }: ConversionSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localPlan, setLocalPlan] = useState<ValidationReport['conversion'] | null>(null);
  const plan = report.conversion ?? localPlan;

  const run = async () => {
    if (!form || loading) return;
    const tokenError = spendOrExplain(TOKEN_COSTS.tool_light, language, labels.title);
    if (tokenError) {
      setError(tokenError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const context = {
        intent: report.intent,
        rejection_reasons: report.rejection?.reasons,
        quotes: report.rejection?.quotes,
        top_questions: report.top_questions,
        personas: report.personas,
        reactions: report.reactions,
      };
      const data = await aiClient.buildConversion<{ conversion: ValidationReport['conversion'] }>(
        { idea: form, context, language },
        labels.error
      );
      if (onUpdateReport) onUpdateReport({ ...report, conversion: data.conversion });
      else setLocalPlan(data.conversion);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.error);
    } finally {
      setLoading(false);
    }
  };

  const effortBadge = (effort: 'low' | 'medium' | 'high') => {
    const map = {
      low: { text: labels.effortLow, cls: 'text-green-400 border-green-800/40 bg-green-950/20' },
      medium: { text: labels.effortMed, cls: 'text-yellow-400 border-yellow-800/40 bg-yellow-950/20' },
      high: { text: labels.effortHigh, cls: 'text-orange-400 border-orange-800/40 bg-orange-950/20' },
    }[effort];
    return (
      <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 flex-shrink-0 ${map.cls}`}>
        {labels.effortLabel}: {map.text}
      </span>
    );
  };

  return (
    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
      <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-2">🔧 {labels.title}</h2>
      <p className="text-xs text-zinc-500 mb-4">{labels.subtitle}</p>

      {!plan ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <button
            onClick={run}
            disabled={!form || loading}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {labels.running}
              </>
            ) : (
              <>🚀 {labels.run}</>
            )}
          </button>
          {!form && <p className="text-xs text-zinc-600 text-center max-w-sm">{labels.needData}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {plan.summary && (
            <p className="text-sm text-zinc-200 leading-relaxed bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-4 py-3">
              {plan.summary}
            </p>
          )}
          {plan.sections && plan.sections.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-4">
              {plan.sections.map((section) => (
                <div key={section.side} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{section.label}</p>
                    {section.summary && <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{section.summary}</p>}
                  </div>
                  {section.levers.map((l, i) => (
                    <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-sm text-zinc-100 font-medium leading-relaxed">{l.change}</p>
                        {effortBadge(l.effort)}
                      </div>
                      {l.addresses && (
                        <p className="text-[11px] text-zinc-500 mb-2">
                          <span className="text-zinc-600">↳ {labels.addresses}:</span> {l.addresses}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500" style={{ width: `${l.could_convert}%` }} />
                        </div>
                        <span className="text-xs text-emerald-400 font-semibold flex-shrink-0">
                          +{l.could_convert}% {labels.impact}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {plan.levers.map((l, i) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm text-zinc-100 font-medium leading-relaxed">{l.change}</p>
                    {effortBadge(l.effort)}
                  </div>
                  {l.addresses && (
                    <p className="text-[11px] text-zinc-500 mb-2">
                      <span className="text-zinc-600">↳ {labels.addresses}:</span> {l.addresses}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500" style={{ width: `${l.could_convert}%` }} />
                    </div>
                    <span className="text-xs text-emerald-400 font-semibold flex-shrink-0">
                      +{l.could_convert}% {labels.impact}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface AnglesLabels {
  title: string;
  subtitle: string;
  run: string;
  running: string;
  needData: string;
  channel: string;
  proof: string;
  cta: string;
  preempt: string;
  targets: string;
  error: string;
}

interface AnglesSectionProps {
  report: ValidationReport;
  form?: IdeaFormData | null;
  language: 'hr' | 'en';
  onUpdateReport?: (r: ValidationReport) => void;
  labels: AnglesLabels;
}

function AnglesSection({ report, form, language, onUpdateReport, labels }: AnglesSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localAngles, setLocalAngles] = useState<ValidationReport['angles'] | null>(null);
  const angles = report.angles ?? localAngles;

  const run = async () => {
    if (!form || loading) return;
    const tokenError = spendOrExplain(TOKEN_COSTS.tool_light, language, labels.title);
    if (tokenError) {
      setError(tokenError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const context = {
        clusters: report.clusters,
        opportunity: report.opportunity,
        target_audience: report.target_audience,
        rejection: report.rejection,
      };
      const data = await aiClient.buildAngles<{ angles: ValidationReport['angles'] }>(
        { idea: form, context, language },
        labels.error
      );
      if (onUpdateReport) onUpdateReport({ ...report, angles: data.angles });
      else setLocalAngles(data.angles);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
      <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-2">🎯 {labels.title}</h2>
      <p className="text-xs text-zinc-500 mb-4">{labels.subtitle}</p>

      {!angles ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <button
            onClick={run}
            disabled={!form || loading}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {labels.running}
              </>
            ) : (
              <>🚀 {labels.run}</>
            )}
          </button>
          {!form && <p className="text-xs text-zinc-600 text-center max-w-sm">{labels.needData}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {angles.map((a, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-indigo-300">{a.angle}</p>
                {a.cluster_label && (
                  <span className="flex-shrink-0 text-[10px] text-zinc-400 border border-zinc-700 rounded-full px-2 py-0.5">
                    {a.cluster_label}{typeof a.target_pct === 'number' ? ` · ${a.target_pct}%` : ''}
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-100 leading-relaxed bg-zinc-800/40 border border-zinc-700/40 rounded-lg px-3 py-2">
                &ldquo;{a.message}&rdquo;
              </p>
              {a.channel && (
                <p className="text-xs text-zinc-400">
                  <span className="text-zinc-500">📍 {labels.channel}:</span> {a.channel}
                </p>
              )}
              {a.proof && (
                <p className="text-xs text-zinc-400">
                  <span className="text-zinc-500">{labels.proof}:</span> {a.proof}
                </p>
              )}
              {a.cta && (
                <p className="text-xs text-zinc-400">
                  <span className="text-zinc-500">{labels.cta}:</span> {a.cta}
                </p>
              )}
              {a.preempt_objection && (
                <p className="text-xs text-zinc-400">
                  <span className="text-zinc-500">🛡 {labels.preempt}:</span> {a.preempt_objection}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface ConjointLabels {
  title: string;
  subtitle: string;
  run: string;
  running: string;
  needData: string;
  importance: string;
  bestPackage: string;
  sample: string;
  error: string;
}

interface ConjointSectionProps {
  report: ValidationReport;
  form?: IdeaFormData | null;
  language: 'hr' | 'en';
  onUpdateReport?: (r: ValidationReport) => void;
  labels: ConjointLabels;
}

function ConjointSection({ report, form, language, onUpdateReport, labels }: ConjointSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localConjoint, setLocalConjoint] = useState<ValidationReport['conjoint'] | null>(null);
  const conjoint = report.conjoint ?? localConjoint;
  const hasPersonas = !!report.personas && report.personas.length >= 8;

  const run = async () => {
    if (!form || loading || !hasPersonas) return;
    const tokenError = spendOrExplain(TOKEN_COSTS.tool_light, language, labels.title);
    if (tokenError) {
      setError(tokenError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await aiClient.runConjoint<{ conjoint: ValidationReport['conjoint'] }>(
        { idea: form, personas: report.personas, reactions: report.reactions, language },
        labels.error
      );
      if (onUpdateReport) onUpdateReport({ ...report, conjoint: data.conjoint });
      else setLocalConjoint(data.conjoint);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.error);
    } finally {
      setLoading(false);
    }
  };

  const sorted = conjoint ? [...conjoint.attributes].sort((a, b) => b.importance - a.importance) : [];

  return (
    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
      <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-2">⚖️ {labels.title}</h2>
      <p className="text-xs text-zinc-500 mb-4">{labels.subtitle}</p>

      {!conjoint ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <button
            onClick={run}
            disabled={!form || loading || !hasPersonas}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {labels.running}
              </>
            ) : (
              <>🚀 {labels.run}</>
            )}
          </button>
          {(!form || !hasPersonas) && <p className="text-xs text-zinc-600 text-center max-w-sm">{labels.needData}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-5">
          {conjoint.verdict && (
            <p className="text-sm text-zinc-200 leading-relaxed bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-4 py-3">
              {conjoint.verdict}
            </p>
          )}

          {/* Važnost atributa */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{labels.importance}</p>
            <div className="space-y-3">
              {sorted.map((a) => (
                <div key={a.name}>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm text-zinc-200 font-medium">{a.name}</span>
                    <span className="text-xs text-indigo-300 font-semibold">{a.importance}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden mb-2">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-500" style={{ width: `${a.importance}%` }} />
                  </div>
                  {/* part-worth po razini */}
                  <div className="grid gap-1 pl-1">
                    {a.levels.map((lv) => (
                      <div key={lv.level} className="flex items-center gap-2">
                        <span className={`text-xs w-32 flex-shrink-0 truncate ${lv.level === a.best_level ? 'text-emerald-300 font-medium' : 'text-zinc-400'}`}>
                          {lv.level === a.best_level ? '★ ' : ''}{lv.level}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div className={`h-full rounded-full ${lv.level === a.best_level ? 'bg-emerald-500' : 'bg-zinc-600'}`} style={{ width: `${lv.utility}%` }} />
                        </div>
                        <span className="text-[10px] text-zinc-500 w-7 text-right flex-shrink-0">{lv.utility}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pobjednički paket */}
          <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-4 py-3">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-1.5">★ {labels.bestPackage}</p>
            <div className="flex flex-wrap gap-2">
              {conjoint.winning_combo.map((c) => (
                <span key={c.attribute} className="text-xs rounded-full border border-emerald-700/50 bg-emerald-900/30 px-2.5 py-1 text-emerald-200">
                  {c.attribute}: <span className="font-medium">{c.level}</span>
                </span>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-zinc-600">
            {labels.sample}: {conjoint.sample_size} · {conjoint.tasks} tasks
            {conjoint.sample_label ? ` · ${conjoint.sample_label}` : ''}
          </p>
        </div>
      )}
    </section>
  );
}

interface DashboardProps {
  report: ValidationReport;
  form?: IdeaFormData | null;
  onUpdateReport?: (newReport: ValidationReport) => void;
}

export default function Dashboard({ report, form, onUpdateReport }: DashboardProps) {
  const { language } = useAuth();
  const [activeSection, setActiveSection] = useState<'overview' | 'audience' | 'objections' | 'action' | 'deeper' | 'personas'>('overview');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showPersonas, setShowPersonas] = useState(false);
  const [showToolShelf, setShowToolShelf] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'buy' | 'maybe' | 'reject'>('all');
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [regenerateError, setRegenerateError] = useState('');

  const handleRegeneratePersonas = async () => {
    if (!form || !onUpdateReport || isRegenerating) return;
    setIsRegenerating(true);
    setRegenerateError('');
    try {
      const baseForm: IdeaFormData = { ...form, personas: undefined, clarifications: undefined };
      const data = await aiClient.validateIdea<ValidationReport>(
        { ...baseForm, language },
        'Persona regeneration failed'
      );
      onUpdateReport(data);
      setShowRegenerateConfirm(false);
    } catch (err: unknown) {
      setRegenerateError(err instanceof Error ? err.message : 'Error regenerating personas.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const t = {
    hr: {
      disclaimer: 'Simulirani odgovori AI persona, ne pravi korisnici. Koristi kao smjernicu, ne kao dokaz.',
      simulatedBuyers: 'simuliranih kupaca',
      segmentsTitle: 'Usporedba publika',
      segmentsSubtitle: 'Kako je ista ideja prošla kod svake ciljane publike — odmah vidiš gdje proizvod najbolje rezonira.',
      segmentsPersonas: 'persona',
      segmentsWinner: 'Najjača publika',
      segmentBadge: 'Publika',
      pricingTitle: 'Analiza cijene (Van Westendorp)',
      pricingSubtitle: 'Svaka persona kaže pri kojoj je cijeni proizvod prejeftin, povoljan, skup i preskup — iz toga računamo prihvatljiv raspon i optimalnu cijenu.',
      pricingRun: 'Pokreni analizu cijene',
      pricingRunning: 'Persone procjenjuju cijenu...',
      pricingNeedData: 'Treba postojati cijena i podaci o personama. Pokreni noviji test pa probaj ponovno.',
      pricingRange: 'Prihvatljiv raspon',
      pricingOptimal: 'Optimalna cijena',
      pricingYourPrice: 'Tvoja cijena',
      pricingNA: 'n/d',
      pricingSample: 'odgovora',
      pcTooCheap: 'Prejeftino',
      pcCheap: 'Povoljno',
      pcExpensive: 'Skupo',
      pcTooExpensive: 'Preskupo',
      pricingError: 'Greška u analizi cijene. Pokušaj ponovno.',
      interviewTitle: 'Pitanja za prave intervjue',
      interviewSubtitle: 'AI test je prvi filter — prava validacija su razgovori s ljudima. Iz rupa ovog testa gradimo skriptu pitanja (Mom Test stil: o prošlom ponašanju, bez sugeriranja).',
      interviewRun: 'Generiraj pitanja za intervjue',
      interviewRunning: 'Gradim skriptu pitanja...',
      interviewNeedData: 'Treba postojati ideja (pokreni test pa probaj ponovno).',
      interviewWho: 'Koga intervjuirati',
      interviewWhere: 'Gdje ih naći',
      interviewTests: 'Testira',
      interviewListen: 'Slušaj za',
      interviewCopy: 'Kopiraj skriptu',
      interviewCopied: '✓ Kopirano',
      interviewError: 'Greška pri generiranju pitanja. Pokušaj ponovno.',
      strategyTitle: 'Founder Strategy Review',
      strategySubtitle: 'Odaberi strateški mod i pretvori validaciju u jasan sljedeći sprint: što raditi sada, što ne dirati i koje odluke moraš donijeti.',
      strategyRun: 'Generiraj strategiju',
      strategyRunning: 'Razmišljam kao founder board...',
      strategyNeedData: 'Treba postojati ideja i report da se strategija može generirati.',
      strategyError: 'Greška pri generiranju strategije. Pokušaj ponovno.',
      strategyRecommendation: 'Preporuka',
      strategyRead: 'Strateško čitanje',
      strategyDoNow: 'U scope sada',
      strategyNotNow: 'Ne sada',
      strategyNextSprint: 'Sljedeći sprint',
      strategyRisks: 'Rizici',
      strategyDecisions: 'Otvorene odluke',
      strategyPriority: 'Prioritet',
      strategyModes: {
        go_bigger: { title: 'Go bigger', desc: 'Pronađi 10x veću verziju ako podaci to dopuštaju.' },
        tighten_wedge: { title: 'Tighten wedge', desc: 'Suzi na najmanji prodajni pilot i najjači segment.' },
        fix_objections: { title: 'Fix objections', desc: 'Fokus samo na prigovore, skeptike i blokere.' },
        prepare_launch: { title: 'Prepare launch', desc: 'Pretvori rezultat u landing, outreach i prvi test.' },
      },
      researchTitle: 'Market Research s izvorima',
      researchSubtitle: 'Live web istraživanje za startupove i lokalne biznise: konkurencija, cijene, poticaji, VC/funding i lokalni rast.',
      researchRun: 'Istraži',
      researchRunning: 'Istražujem...',
      researchNeedData: 'Treba postojati ideja da bi se istraživanje moglo povezati s tržištem.',
      researchError: 'Greška pri istraživanju. Pokušaj ponovno.',
      researchCustomPlaceholder: 'Upiši konkretan upit, npr. poticaji za digitalizaciju obrta Hrvatska...',
      researchLatest: 'Zadnje istraživanje',
      researchFindings: 'Nalazi',
      researchSources: 'Izvori',
      researchQuery: 'Upit',
      researchAngles: {
        competitors: { title: 'Konkurencija', desc: 'Tko već rješava isti problem i gdje su rupe.' },
        pricing: { title: 'Cijene', desc: 'Stvarni raspon cijena i modeli naplate u kategoriji.' },
        voice_of_customer: { title: 'Glas tržišta', desc: 'Recenzije, prigovori i riječi koje kupci stvarno koriste.' },
        demand: { title: 'Potražnja', desc: 'Signali veličine tržišta, trenda i interesa.' },
        grants: { title: 'Poticaji', desc: 'Državni, EU i lokalni programi koje vrijedi provjeriti.' },
        funding: { title: 'VC i funding', desc: 'Fondovi, akceleratori i realan put do kapitala.' },
        local_growth: { title: 'Lokalni rast', desc: 'Širenje usluge/proizvoda po zonama, kanalima i kapacitetu.' },
        custom: { title: 'Custom', desc: 'Tvoj vlastiti research upit.' },
      },
      commandTitle: 'Command Center',
      commandSubtitle: 'Napiši cilj normalnim jezikom. Ako znaš što želiš, pokreni direktno; ako ne znaš, kreni od prve preporuke.',
      commandPrimaryHint: 'Što želiš napraviti sljedeće?',
      commandQuickStart: 'Trenutno stanje',
      commandRecommended: 'Preporučeni sljedeći potezi',
      commandRecommendedHelp: 'AI bira najkorisnije alate za ovaj izvještaj. Kreni od prvog ako nisi siguran.',
      commandAllTools: 'Svi alati',
      commandAllToolsHelp: 'Cijeli katalog alata. Odaberi direktno ili upiši cilj gore pa ćemo odabrati alat za tebe.',
      commandRecentResult: 'Zadnje pokrenuto',
      commandInputPlaceholder: 'npr. nađi mi poticaje, pripremi VC put, napravi plan lokalnog širenja...',
      commandRun: 'Pokreni',
      commandRunning: 'Radim...',
      commandNeedData: 'Treba postojati ideja i report da bi command center mogao pokretati alate.',
      commandError: 'Nisam uspio pokrenuti alat. Pokušaj ponovno.',
      commandResult: 'Rezultat',
      commandShowAllTools: 'Prikaži sve alate',
      commandHideAllTools: 'Sakrij alate',
      commandRoutedTo: 'Pokrenuto:',
      commandNoMatch: 'Nisam siguran koji alat treba, pa sam odabrao najkorisniji sljedeći korak.',
      commandToolTitles: {
        strategy: 'Strategija',
        research_grants: 'Poticaji',
        research_funding: 'VC/funding',
        research_competitors: 'Konkurencija',
        research_local_growth: 'Lokalni rast',
        pricing: 'Cijena',
        interview: 'Intervjui',
        conversion: 'Preokret',
        angles: 'Marketing',
      },
      commandToolDescriptions: {
        strategy: 'Suzi fokus i složi sljedeći sprint.',
        research_grants: 'Provjeri programe, uvjete i izvore.',
        research_funding: 'Mapiraj fondove, akceleratore i očekivanu trakciju.',
        research_competitors: 'Nađi alternative i praznine u tržištu.',
        research_local_growth: 'Planiraj širenje po zoni, kanalu i kapacitetu.',
        pricing: 'Procijeni raspon i prihvatljivost cijene.',
        interview: 'Pripremi pitanja za stvarne razgovore.',
        conversion: 'Pretvori prigovore u konkretne promjene.',
        angles: 'Složi poruke i kanale po skupini.',
      },
      conversionTitle: 'Plan za preokret',
      conversionSubtitle: 'Iz prigovora onih koji su rekli "možda" ili "odbija" — konkretne promjene koje bi preokrenule najviše ne-kupaca, poredane po učinku.',
      conversionRun: 'Generiraj plan za preokret',
      conversionRunning: 'Tražim poluge preokreta...',
      conversionNeedData: 'Treba postojati ideja (pokreni test pa probaj ponovno).',
      conversionAddresses: 'Makne prepreku',
      conversionImpact: 'preokret',
      effortLabel: 'Trud',
      effortLow: 'Lako',
      effortMed: 'Srednje',
      effortHigh: 'Teško',
      conversionError: 'Greška pri generiranju plana. Pokušaj ponovno.',
      anglesTitle: 'Marketinški kutevi po skupini',
      anglesSubtitle: 'Za svaku prirodnu skupinu — kojom porukom je osvojiti, na kojem kanalu i koji prigovor preduhitriti. Spremno za A/B test.',
      anglesRun: 'Generiraj marketinške kuteve',
      anglesRunning: 'Slažem kuteve po skupini...',
      anglesNeedData: 'Treba postojati ideja (pokreni test pa probaj ponovno).',
      anglesChannel: 'Kanal',
      anglesProof: 'Dokaz',
      anglesCta: 'CTA',
      anglesPreempt: 'Preduhitri prigovor',
      anglesTargets: 'Cilja',
      anglesError: 'Greška pri generiranju kuteva. Pokušaj ponovno.',
      conjointTitle: 'Conjoint — što kupcima stvarno vrijedi',
      conjointSubtitle: 'Persone biraju između paketa (značajke × cijena) u forsiranom trade-offu — pa se računa koliko je kojem atributu bitan koji udio odluke i najbolji paket.',
      conjointRun: 'Pokreni conjoint analizu',
      conjointRunning: 'Persone biraju pakete...',
      conjointNeedData: 'Treba ideja i persone iz testa (pokreni test pa probaj ponovno).',
      conjointImportance: 'Važnost atributa (udio u odluci)',
      conjointBestPackage: 'Najpoželjniji paket',
      conjointSample: 'Uzorak',
      conjointError: 'Greška pri conjoint analizi. Pokušaj ponovno.',
      deeperTitle: 'Dublje analize',
      deeperSubtitle: 'Dodatni AI alati — pokreni po potrebi.',
      scorePromising: 'Obećavajuće',
      scoreMixed: 'Miješano',
      scoreChallenging: 'Izazovno',
      buy: 'Kupio bi',
      maybe: 'Možda',
      reject: 'Odbija',
      intentTitle: 'Kupovna namjera',
      confidenceTitle: 'Pouzdanost procjene',
      confidenceSubtitle: 'Ovo nije tržišni dokaz nego sintetička simulacija. Ovaj score kaže koliko su rezultati dobro potkrijepljeni unosom, personama i dostupnim kontekstom.',
      confidenceReasons: 'Zašto vjerovati ovom smjeru',
      confidenceMissing: 'Što treba dokazati u stvarnom svijetu',
      confidenceLow: 'Niska',
      confidenceMedium: 'Srednja',
      confidenceHigh: 'Visoka',
      confidenceFallbackReason: 'Report je generiran prije confidence modela, pa koristimo konzervativnu procjenu.',
      confidenceFallbackMissing: 'Potvrdi rezultat kroz stvarne razgovore, landing page test ili plaćeni pilot.',
      radarTech: 'Tehnologija',
      radarBudget: 'Budžet',
      radarTime: 'Ušteda vremena',
      radarRisk: 'Tolerancija rizika',
      primaryAudience: 'Primarna publika',
      assumptionVsReality: 'Pretpostavka vs stvarnost',
      topReasons: 'Top razlozi ZA kupnju',
      primaryBuyerProfile: 'Profil primarnog kupca',
      objectionShare: 'Udio',
      skepticsVoices: 'Glasovi skeptika',
      discoveryBoardTitle: '❓ Pitanja koja tržište treba razjasniti',
      discoveryBoardSubtitle: 'Ovo nisu nova analiza ni anketa za ponovno pokretanje. Ovo su konkretna pitanja iz reakcija persona: što im nije jasno, zašto bi koristili proizvod i što ih blokira.',
      discoveryPayer: 'Biznisi / platiše',
      discoveryUser: 'Korisnici / potražnja',
      discoveryGeneral: 'Opća pitanja',
      discoveryContext: 'Kontekst',
      discoveryEmpty: 'Nema dovoljno pitanja u ovom izvještaju. Pokreni noviju analizu s personama.',
      actionPlan: '✅ Akcijski plan',
      product: 'Proizvod',
      marketing: 'Marketing',
      pricing: 'Cijena',
      regeneratePersonas: 'Regeneriraj persone',
      regeneratingPersonas: 'Regeneriram persone...',
      regenerateConfirmTitle: 'Regenerirati persone?',
      regenerateConfirmHelp: 'Ovo će ponovno pokrenuti simulaciju sa svježom sintetičkom publikom. Postojeći izvještaj će se zamijeniti novim rezultatom.',
      regenerateConfirmCancel: 'Odustani',
      regenerateConfirmRun: 'Da, regeneriraj',
      regenerateErrorTitle: 'Regeneriranje nije uspjelo',
      sectionSummary: '📊 Rezime',
      b2b2cSplitTitle: 'Rezultati po strani tržišta',
      b2b2cSplitSubtitle: 'Kod B2B2C modela odvojeno gledamo potražnju korisnika i spremnost biznisa da plate.',
      marketSidePayerTitle: 'Biznisi / platiše',
      marketSidePayerDesc: 'Ova strana procjenjuje ROI, budžet, povjerenje, operativnu korist i spremnost na plaćanje.',
      marketSideUserTitle: 'Korisnici / potražnja',
      marketSideUserDesc: 'Ova strana procjenjuje korisnost, naviku korištenja, povjerenje i privlačnost iskustva.',
      sideTopReasons: 'Glavni razlozi',
      sectionOpportunity: '🎯 Prilika (Opportunity Score)',
      oppImportance: 'Važnost problema',
      oppSatisfaction: 'Zadovoljstvo postojećim',
      oppUnmet: 'Najveće neispunjene potrebe',
      oppAlternatives: 'Što kupci koriste danas (prava konkurencija)',
      oppPeople: 'kupaca',
      sectionClusters: '🧩 Prirodne skupine (iz podataka)',
      clustersIntro1: 'Od',
      clustersIntro2: 'agenata izdvojilo se',
      clustersIntro3: 'prirodnih skupina (algoritamski iz odgovora, ne unaprijed)',
      clOpportunity: 'Prilika',
      clMainProblem: 'Glavni problem',
      clMainObjection: 'Glavni prigovor',
      clOfBuyers: 'kupaca',
      sectionAudience: '👥 Ciljna skupina',
      sectionRejection: '🧱 Zid odbijanja',
      personaBrowser: '👤 Detaljni pregled persona',
      personaBrowserSubtitle: 'Pregledaj profile i individualna mišljenja svih simuliranih kupaca koji su sudjelovali u analizi kao dokaz autentičnosti.',
      filterAll: 'Sve',
      searchPlaceholder: 'Pretraži po ulozi, industriji ili regiji...',
      decisionLabel: 'Odluka',
      reasonLabel: 'Glavni razlog',
      willPayLabel: 'Spremnost na plaćanje',
      techLiteracyLabel: 'Tehnološka pismenost',
      incomeLabel: 'Prihodi',
      regionLabel: 'Regija',
      ageLabel: 'Dob',
      industryLabel: 'Industrija',
      personalityLabel: 'Osobnost',
      buyerTypeLabel: 'Tip kupca',
      marketSideLabel: 'Strana tržišta',
      marketSidePayer: 'Platiša',
      marketSideUser: 'Korisnik',
      marketSidePartner: 'Partner',
      marketSideBoth: 'Oboje',
      quoteLabel: 'Izjava',
      objectionsLabel: 'Prigovori',
      questionsLabel: 'Pitanja',
      showAllPersonas: 'Prikaži svih 50 persona',
      hideAllPersonas: 'Sakrij pregled persona',
      noReactionsData: 'Podaci o reakcijama persona nisu dostupni za stare analize. Molimo pokrenite novu analizu.',
    },
    en: {
      disclaimer: 'Simulated customer persona reactions, not real users. Use as a guideline, not as validation proof.',
      simulatedBuyers: 'simulated buyers',
      segmentsTitle: 'Audience comparison',
      segmentsSubtitle: 'How the same idea landed with each target audience — instantly see where the product resonates best.',
      segmentsPersonas: 'personas',
      segmentsWinner: 'Strongest audience',
      segmentBadge: 'Audience',
      pricingTitle: 'Pricing analysis (Van Westendorp)',
      pricingSubtitle: 'Each persona says at which price the product feels too cheap, a bargain, expensive and too expensive — from that we compute the acceptable range and optimal price.',
      pricingRun: 'Run pricing analysis',
      pricingRunning: 'Personas estimating price...',
      pricingNeedData: 'A price and persona data are required. Run a newer test and try again.',
      pricingRange: 'Acceptable range',
      pricingOptimal: 'Optimal price',
      pricingYourPrice: 'Your price',
      pricingNA: 'n/a',
      pricingSample: 'responses',
      pcTooCheap: 'Too cheap',
      pcCheap: 'Bargain',
      pcExpensive: 'Expensive',
      pcTooExpensive: 'Too expensive',
      pricingError: 'Pricing analysis error. Try again.',
      interviewTitle: 'Questions for real interviews',
      interviewSubtitle: 'The AI test is a first filter — real validation is talking to people. From the gaps this test surfaced we build an interview script (Mom Test style: past behavior, non-leading).',
      interviewRun: 'Generate interview questions',
      interviewRunning: 'Building the question script...',
      interviewNeedData: 'An idea is required (run a test and try again).',
      interviewWho: 'Who to interview',
      interviewWhere: 'Where to find them',
      interviewTests: 'Tests',
      interviewListen: 'Listen for',
      interviewCopy: 'Copy script',
      interviewCopied: '✓ Copied',
      interviewError: 'Error generating questions. Try again.',
      strategyTitle: 'Founder Strategy Review',
      strategySubtitle: 'Choose a strategic mode and turn validation into a clear next sprint: what to do now, what not to touch, and which decisions must be made.',
      strategyRun: 'Generate strategy',
      strategyRunning: 'Thinking like a founder board...',
      strategyNeedData: 'An idea and report are required to generate strategy.',
      strategyError: 'Error generating strategy. Try again.',
      strategyRecommendation: 'Recommendation',
      strategyRead: 'Strategic read',
      strategyDoNow: 'In scope now',
      strategyNotNow: 'Not now',
      strategyNextSprint: 'Next sprint',
      strategyRisks: 'Risks',
      strategyDecisions: 'Open decisions',
      strategyPriority: 'Priority',
      strategyModes: {
        go_bigger: { title: 'Go bigger', desc: 'Find the 10x version if the data supports it.' },
        tighten_wedge: { title: 'Tighten wedge', desc: 'Narrow to the smallest sellable pilot and strongest segment.' },
        fix_objections: { title: 'Fix objections', desc: 'Focus only on objections, skeptics, and blockers.' },
        prepare_launch: { title: 'Prepare launch', desc: 'Turn the result into landing, outreach, and first test.' },
      },
      researchTitle: 'Market Research with sources',
      researchSubtitle: 'Live web research for startups and local businesses: competitors, pricing, grants, VC/funding, and local growth.',
      researchRun: 'Research',
      researchRunning: 'Researching...',
      researchNeedData: 'An idea is required to connect research to the market.',
      researchError: 'Research error. Try again.',
      researchCustomPlaceholder: 'Write a specific query, e.g. Croatia SME digitalization grants...',
      researchLatest: 'Latest research',
      researchFindings: 'Findings',
      researchSources: 'Sources',
      researchQuery: 'Query',
      researchAngles: {
        competitors: { title: 'Competitors', desc: 'Who already solves this problem and where the gaps are.' },
        pricing: { title: 'Pricing', desc: 'Real category price ranges and pricing models.' },
        voice_of_customer: { title: 'Voice of market', desc: 'Reviews, complaints, and the words buyers actually use.' },
        demand: { title: 'Demand', desc: 'Signals of market size, trend, and interest.' },
        grants: { title: 'Grants', desc: 'Government, EU, and local programs worth checking.' },
        funding: { title: 'VC and funding', desc: 'Funds, accelerators, and a realistic path to capital.' },
        local_growth: { title: 'Local growth', desc: 'Expansion by zones, channels, repeat demand, and capacity.' },
        custom: { title: 'Custom', desc: 'Your own research query.' },
      },
      commandTitle: 'Command Center',
      commandSubtitle: 'Type a goal in plain language. If you know what you want, run it directly; if not, start with the first recommendation.',
      commandPrimaryHint: 'What do you want to do next?',
      commandQuickStart: 'Current state',
      commandRecommended: 'Recommended next moves',
      commandRecommendedHelp: 'AI picks the most useful tools for this report. Start with the first one if you are not sure.',
      commandAllTools: 'All tools',
      commandAllToolsHelp: 'The full tool catalog. Pick directly or type a goal above and we will route it for you.',
      commandRecentResult: 'Latest result',
      commandInputPlaceholder: 'e.g. find grants, prepare VC path, create local expansion plan...',
      commandRun: 'Run',
      commandRunning: 'Working...',
      commandNeedData: 'An idea and report are required before the command center can run tools.',
      commandError: 'Could not run the tool. Try again.',
      commandResult: 'Result',
      commandShowAllTools: 'Show all tools',
      commandHideAllTools: 'Hide tools',
      commandRoutedTo: 'Routed to:',
      commandNoMatch: 'I was not sure which tool fits, so I picked the most useful next step.',
      commandToolTitles: {
        strategy: 'Strategy',
        research_grants: 'Grants',
        research_funding: 'VC/funding',
        research_competitors: 'Competitors',
        research_local_growth: 'Local growth',
        pricing: 'Pricing',
        interview: 'Interviews',
        conversion: 'Conversion',
        angles: 'Marketing',
      },
      commandToolDescriptions: {
        strategy: 'Narrow the focus and define the next sprint.',
        research_grants: 'Check programs, eligibility, and sources.',
        research_funding: 'Map funds, accelerators, and traction expectations.',
        research_competitors: 'Find alternatives and market gaps.',
        research_local_growth: 'Plan expansion by zone, channel, and capacity.',
        pricing: 'Estimate price range and willingness to pay.',
        interview: 'Prepare questions for real customer conversations.',
        conversion: 'Turn objections into concrete changes.',
        angles: 'Craft messages and channels by group.',
      },
      conversionTitle: 'Conversion plan',
      conversionSubtitle: 'From the objections of those who said "maybe" or "reject" — the specific changes that would convert the most non-buyers, ranked by impact.',
      conversionRun: 'Generate conversion plan',
      conversionRunning: 'Finding conversion levers...',
      conversionNeedData: 'An idea is required (run a test and try again).',
      conversionAddresses: 'Removes barrier',
      conversionImpact: 'flip',
      effortLabel: 'Effort',
      effortLow: 'Low',
      effortMed: 'Medium',
      effortHigh: 'High',
      conversionError: 'Error generating plan. Try again.',
      anglesTitle: 'Marketing angles per group',
      anglesSubtitle: 'For each natural group — which message wins them, on which channel, and which objection to pre-empt. Ready to A/B test.',
      anglesRun: 'Generate marketing angles',
      anglesRunning: 'Crafting angles per group...',
      anglesNeedData: 'An idea must exist (run a test, then try again).',
      anglesChannel: 'Channel',
      anglesProof: 'Proof',
      anglesCta: 'CTA',
      anglesPreempt: 'Pre-empt objection',
      anglesTargets: 'Targets',
      anglesError: 'Error generating angles. Try again.',
      conjointTitle: 'Conjoint — what buyers truly value',
      conjointSubtitle: 'Personas choose between packages (features × price) in a forced trade-off — then we compute how much each attribute drives the decision and the best package.',
      conjointRun: 'Run conjoint analysis',
      conjointRunning: 'Personas choosing packages...',
      conjointNeedData: 'Needs an idea and personas from a test (run a test, then try again).',
      conjointImportance: 'Attribute importance (share of decision)',
      conjointBestPackage: 'Most preferred package',
      conjointSample: 'Sample',
      conjointError: 'Error in conjoint analysis. Try again.',
      deeperTitle: 'Deeper analyses',
      deeperSubtitle: 'Extra AI tools — run on demand.',
      scorePromising: 'Promising',
      scoreMixed: 'Mixed',
      scoreChallenging: 'Challenging',
      buy: 'Would buy',
      maybe: 'Maybe',
      reject: 'Rejects',
      intentTitle: 'Purchase Intent',
      confidenceTitle: 'Confidence',
      confidenceSubtitle: 'This is synthetic market simulation, not market proof. This score shows how well the result is supported by the input, personas, and available context.',
      confidenceReasons: 'Why this direction is credible',
      confidenceMissing: 'What needs real-world proof',
      confidenceLow: 'Low',
      confidenceMedium: 'Medium',
      confidenceHigh: 'High',
      confidenceFallbackReason: 'This report was generated before the confidence model, so we use a conservative estimate.',
      confidenceFallbackMissing: 'Validate the result with real interviews, a landing page test, or a paid pilot.',
      radarTech: 'Tech',
      radarBudget: 'Budget',
      radarTime: 'Time Saving',
      radarRisk: 'Risk Tolerance',
      primaryAudience: 'Primary Segment',
      assumptionVsReality: 'Assumption vs Reality',
      topReasons: 'Top Reasons to Buy',
      primaryBuyerProfile: 'Primary Buyer Profile',
      objectionShare: 'Share',
      skepticsVoices: 'Voices of Skeptics',
      discoveryBoardTitle: '❓ Questions the market needs clarified',
      discoveryBoardSubtitle: 'This is not a new analysis or survey rerun. These are concrete questions from persona reactions: what is unclear, why they would use it, and what blocks them.',
      discoveryPayer: 'Businesses / payers',
      discoveryUser: 'Users / demand',
      discoveryGeneral: 'General questions',
      discoveryContext: 'Context',
      discoveryEmpty: 'Not enough questions in this report. Run a newer validation with personas.',
      actionPlan: '✅ Action Plan',
      product: 'Product',
      marketing: 'Marketing',
      pricing: 'Pricing',
      regeneratePersonas: 'Regenerate personas',
      regeneratingPersonas: 'Regenerating personas...',
      regenerateConfirmTitle: 'Regenerate personas?',
      regenerateConfirmHelp: 'This reruns the simulation with a fresh synthetic audience. The current report will be replaced by the new result.',
      regenerateConfirmCancel: 'Cancel',
      regenerateConfirmRun: 'Yes, regenerate',
      regenerateErrorTitle: 'Regeneration failed',
      sectionSummary: '📊 Summary',
      b2b2cSplitTitle: 'Results by market side',
      b2b2cSplitSubtitle: 'For B2B2C models we separate user demand from business willingness to pay.',
      marketSidePayerTitle: 'Businesses / payers',
      marketSidePayerDesc: 'This side evaluates ROI, budget, trust, operational value, and willingness to pay.',
      marketSideUserTitle: 'Users / demand',
      marketSideUserDesc: 'This side evaluates usefulness, adoption, trust, and appeal of the experience.',
      sideTopReasons: 'Top reasons',
      sectionOpportunity: '🎯 Opportunity Score',
      oppImportance: 'Problem importance',
      oppSatisfaction: 'Satisfaction with current',
      oppUnmet: 'Biggest unmet needs',
      oppAlternatives: 'What buyers use today (real competition)',
      oppPeople: 'buyers',
      sectionClusters: '🧩 Natural groups (data-driven)',
      clustersIntro1: 'From',
      clustersIntro2: 'agents,',
      clustersIntro3: 'natural groups emerged (algorithmically from responses, not pre-defined)',
      clOpportunity: 'Opportunity',
      clMainProblem: 'Main problem',
      clMainObjection: 'Main objection',
      clOfBuyers: 'buyers',
      sectionAudience: '👥 Target Audience',
      sectionRejection: '🧱 Wall of Rejection',
      personaBrowser: '👤 Detailed Persona Browser',
      personaBrowserSubtitle: 'Browse the profiles and individual opinions of all simulated buyers involved in the analysis as proof of authenticity.',
      filterAll: 'All',
      searchPlaceholder: 'Search by role, industry, or region...',
      decisionLabel: 'Decision',
      reasonLabel: 'Main Reason',
      willPayLabel: 'Willingness to Pay',
      techLiteracyLabel: 'Tech Literacy',
      incomeLabel: 'Income',
      regionLabel: 'Region',
      ageLabel: 'Age',
      industryLabel: 'Industry',
      personalityLabel: 'Personality',
      buyerTypeLabel: 'Buyer Type',
      marketSideLabel: 'Market Side',
      marketSidePayer: 'Payer',
      marketSideUser: 'User',
      marketSidePartner: 'Partner',
      marketSideBoth: 'Both',
      quoteLabel: 'Quote',
      objectionsLabel: 'Objections',
      questionsLabel: 'Questions',
      showAllPersonas: 'Show all 50 personas',
      hideAllPersonas: 'Hide persona browser',
      noReactionsData: 'Persona reaction data is not available for older reports. Please run a new validation.',
    }
  }[language];

  const scoreLabel = report.score >= 60 
    ? t.scorePromising 
    : report.score >= 35 
      ? t.scoreMixed 
      : t.scoreChallenging;
  const scoreLabelFor = (score: number) => score >= 60
    ? t.scorePromising
    : score >= 35
      ? t.scoreMixed
      : t.scoreChallenging;
  const marketSideResults = form?.business_model === 'B2B2C'
    ? buildMarketSideResults(report, {
        payer: t.marketSidePayerTitle,
        payerDesc: t.marketSidePayerDesc,
        user: t.marketSideUserTitle,
        userDesc: t.marketSideUserDesc,
      })
    : [];
  const discoveryQuestions = buildDiscoveryQuestions(report, language);
  const sectionTabs = language === 'en'
    ? [
        { id: 'overview' as const, label: 'Overview', hint: 'Score, summary, command center' },
        { id: 'audience' as const, label: 'Audience', hint: 'Segments, opportunity, clusters' },
        { id: 'objections' as const, label: 'Objections', hint: 'Blockers and questions' },
        { id: 'action' as const, label: 'Action', hint: 'Next moves' },
        { id: 'deeper' as const, label: 'Tools', hint: 'Research, pricing, strategy' },
        { id: 'personas' as const, label: 'Personas', hint: 'Raw synthetic voices' },
      ]
    : [
        { id: 'overview' as const, label: 'Pregled', hint: 'Score, rezime, command center' },
        { id: 'audience' as const, label: 'Publika', hint: 'Segmenti, prilika, skupine' },
        { id: 'objections' as const, label: 'Prepreke', hint: 'Blokade i pitanja' },
        { id: 'action' as const, label: 'Akcija', hint: 'Sljedeći potezi' },
        { id: 'deeper' as const, label: 'Alati', hint: 'Research, cijena, strategija' },
        { id: 'personas' as const, label: 'Persone', hint: 'Sirovi glasovi publike' },
      ];
  const desktopSectionClass = (id: typeof activeSection) =>
    `space-y-6 ${activeSection === id ? 'lg:block' : 'lg:hidden'}`;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-24">
      {showRegenerateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/50">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-800/60 bg-indigo-950/40 text-indigo-200">
              <RefreshCw className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold text-white">{t.regenerateConfirmTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.regenerateConfirmHelp}</p>
            {regenerateError && (
              <div className="mt-4 rounded-2xl border border-red-900/60 bg-red-950/25 p-3">
                <p className="text-sm font-semibold text-red-100">{t.regenerateErrorTitle}</p>
                <p className="mt-1 text-xs leading-relaxed text-red-200/80">{regenerateError}</p>
              </div>
            )}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowRegenerateConfirm(false);
                  setRegenerateError('');
                }}
                disabled={isRegenerating}
                className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.regenerateConfirmCancel}
              </button>
              <button
                type="button"
                onClick={handleRegeneratePersonas}
                disabled={isRegenerating}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRegenerating ? t.regeneratingPersonas : t.regenerateConfirmRun}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meta disclaimer */}
      <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 px-4 py-2 text-xs text-zinc-400 flex items-center gap-2">
        <span className="text-yellow-400">⚠</span>
        {t.disclaimer} · {report.meta.personas_count} {t.simulatedBuyers} · {new Date(report.meta.generated_at).toLocaleString(language === 'en' ? 'en-US' : 'hr-HR')}
      </div>

      <nav className="hidden lg:block sticky top-[73px] z-20 rounded-2xl border border-zinc-800 bg-zinc-950/88 p-2 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="grid grid-cols-6 gap-2">
          {sectionTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`rounded-xl border px-3 py-3 text-left transition-all ${
                activeSection === tab.id
                  ? 'border-indigo-500/70 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-white'
              }`}
            >
              <span className="block text-sm font-black">{tab.label}</span>
              <span className={`mt-1 block truncate text-[10px] ${activeSection === tab.id ? 'text-indigo-100/85' : 'text-zinc-600'}`}>
                {tab.hint}
              </span>
            </button>
          ))}
        </div>
      </nav>

      <div className={desktopSectionClass('overview')}>
      <CommandCenter
        report={report}
        form={form}
        language={language}
        showToolShelf={showToolShelf}
        setShowToolShelf={setShowToolShelf}
        onUpdateReport={onUpdateReport}
        labels={{
          title: t.commandTitle,
          subtitle: t.commandSubtitle,
          primaryHint: t.commandPrimaryHint,
          quickStart: t.commandQuickStart,
          recommended: t.commandRecommended,
          recommendedHelp: t.commandRecommendedHelp,
          allTools: t.commandAllTools,
          allToolsHelp: t.commandAllToolsHelp,
          recentResult: t.commandRecentResult,
          inputPlaceholder: t.commandInputPlaceholder,
          run: t.commandRun,
          running: t.commandRunning,
          needData: t.commandNeedData,
          error: t.commandError,
          result: t.commandResult,
          showAllTools: t.commandShowAllTools,
          hideAllTools: t.commandHideAllTools,
          toolTitles: t.commandToolTitles,
          toolDescriptions: t.commandToolDescriptions,
          routedTo: t.commandRoutedTo,
          noMatch: t.commandNoMatch,
        }}
      />

      {/* 1. Executive Summary */}
      <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
        <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-5">
          {t.sectionSummary}
        </h2>
        {marketSideResults.length >= 2 ? (
          <div className="space-y-5">
            <div className="flex flex-col md:flex-row gap-4 md:items-start">
              <div className="md:w-40 flex-shrink-0 flex justify-center">
                <ScoreRing score={report.score} labelTranslation={scoreLabel} />
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-zinc-200 leading-relaxed text-sm">{report.summary}</p>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                  <p className="text-sm font-semibold text-white">{t.b2b2cSplitTitle}</p>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{t.b2b2cSplitSubtitle}</p>
                </div>
              </div>
            </div>
            <MarketSideComparison
              results={marketSideResults}
              labels={{
                buy: t.buy,
                maybe: t.maybe,
                reject: t.reject,
                intent: t.intentTitle,
                personas: t.segmentsPersonas,
                topReasons: t.sideTopReasons,
                scoreLabel: scoreLabelFor,
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
            <ScoreRing score={report.score} labelTranslation={scoreLabel} />
            <div className="flex-1 space-y-4 w-full">
              <p className="text-zinc-200 leading-relaxed text-sm">{report.summary}</p>
              <IntentDonut 
                intent={report.intent} 
                title={t.intentTitle} 
                labels={{ buy: t.buy, maybe: t.maybe, reject: t.reject }}
              />
            </div>
          </div>
        )}
      </section>

      <ConfidenceCard
        confidence={report.confidence}
        labels={{
          title: t.confidenceTitle,
          subtitle: t.confidenceSubtitle,
          reasons: t.confidenceReasons,
          missing: t.confidenceMissing,
          low: t.confidenceLow,
          medium: t.confidenceMedium,
          high: t.confidenceHigh,
          fallbackReason: t.confidenceFallbackReason,
          fallbackMissing: t.confidenceFallbackMissing,
        }}
      />
      </div>

      <div className={desktopSectionClass('audience')}>
      {/* Usporedba publika (samo ako je test rađen po ciljanim publikama) */}
      {report.segments && report.segments.length > 0 && (
        <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
          <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-2">
            🎯 {t.segmentsTitle}
          </h2>
          <p className="text-xs text-zinc-500 mb-4">{t.segmentsSubtitle}</p>
          <SegmentComparison
            segments={report.segments}
            labels={{
              personas: t.segmentsPersonas,
              winner: t.segmentsWinner,
              buy: t.buy,
              maybe: t.maybe,
              reject: t.reject,
            }}
          />
        </section>
      )}

      {/* 2. Target Skupina */}
      <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
        <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-5">
          {t.sectionAudience}
        </h2>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div>
              <p className="text-sm text-zinc-400 mb-1">{t.primaryAudience}</p>
              <p className="text-zinc-100 font-medium text-sm">{report.target_audience.profile}</p>
            </div>

            {report.target_audience.assumption_vs_reality !== 'No assumption provided' && (
              <div className="rounded-lg bg-indigo-950/40 border border-indigo-800/50 px-4 py-3">
                <p className="text-xs text-indigo-400 font-medium mb-1">{t.assumptionVsReality}</p>
                <p className="text-zinc-200 text-sm">{report.target_audience.assumption_vs_reality}</p>
              </div>
            )}

            <div>
              <p className="text-sm text-zinc-400 mb-2">{t.topReasons}</p>
              <ul className="space-y-1">
                {report.target_audience.top_reasons_to_buy.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-200">
                    <span className="text-green-500 mt-0.5">✓</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="md:w-64 w-full">
            <p className="text-sm text-zinc-400 mb-2 text-center">{t.primaryBuyerProfile}</p>
            <AudienceRadar 
              radar={report.target_audience.radar_data} 
              labels={{ 
                tech: t.radarTech, 
                budget: t.radarBudget, 
                timeSaving: t.radarTime, 
                risk: t.radarRisk 
              }} 
            />
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 text-center mt-1">
              <span>{t.radarTech}: {report.target_audience.radar_data.tech}/10</span>
              <span>{t.radarBudget}: {report.target_audience.radar_data.budget}/10</span>
              <span>{t.radarTime}: {report.target_audience.radar_data.time_saving}/10</span>
              <span>{t.radarRisk}: {report.target_audience.radar_data.risk}/10</span>
            </div>
          </div>
        </div>
      </section>

      {/* Opportunity Score (JTBD) — samo ako postoji (novi izvještaji) */}
      {report.opportunity && (
        <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
          <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-5">
            {t.sectionOpportunity}
          </h2>
          <div className="flex flex-col md:flex-row gap-6">
            {/* Score gauge */}
            <div className="md:w-52 flex-shrink-0 flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div
                className="text-5xl font-bold"
                style={{ color: report.opportunity.score >= 65 ? '#22c55e' : report.opportunity.score >= 45 ? '#eab308' : '#ef4444' }}
              >
                {report.opportunity.score}
              </div>
              <div className="text-xs text-zinc-500 mb-3">/ 100</div>
              <div className="w-full space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>{t.oppImportance}</span>
                  <span className="text-zinc-200 font-medium">{report.opportunity.avg_importance}/10</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>{t.oppSatisfaction}</span>
                  <span className="text-zinc-200 font-medium">{report.opportunity.avg_satisfaction}/10</span>
                </div>
              </div>
            </div>
            {/* Verdict + unmet needs + alternatives */}
            <div className="flex-1 space-y-4">
              <p className="text-sm text-zinc-200 leading-relaxed">{report.opportunity.verdict}</p>

              {report.opportunity.top_problems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{t.oppUnmet}</p>
                  <div className="space-y-1.5">
                    {report.opportunity.top_problems.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className="flex-shrink-0 w-10 text-right font-bold" style={{ color: p.opportunity >= 65 ? '#22c55e' : p.opportunity >= 45 ? '#eab308' : '#71717a' }}>
                          {p.opportunity}
                        </span>
                        <span className="text-zinc-300">{p.problem}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.opportunity.top_alternatives.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{t.oppAlternatives}</p>
                  <div className="flex flex-wrap gap-2">
                    {report.opportunity.top_alternatives.map((a, i) => (
                      <span key={i} className="text-xs rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-zinc-300">
                        {a.name} <span className="text-zinc-500">· {a.count} {t.oppPeople}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Emergentni klasteri (k-means) — samo ako postoje (≥2 skupine) */}
      {report.clusters && report.clusters.length > 0 && (
        <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
          <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-2">
            {t.sectionClusters}
          </h2>
          <p className="text-xs text-zinc-500 mb-4">
            {t.clustersIntro1} {report.meta.personas_count} {t.clustersIntro2}{' '}
            <span className="text-zinc-300 font-medium">{report.clusters.length}</span> {t.clustersIntro3}.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {report.clusters.map((c) => (
              <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-100">{c.label}</p>
                    {c.descriptor && <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{c.descriptor}</p>}
                  </div>
                  <span className="flex-shrink-0 text-xs font-bold rounded-full bg-indigo-900/50 border border-indigo-700/50 text-indigo-300 px-2.5 py-1">
                    {c.size_pct}%
                  </span>
                </div>

                {/* intent mini-bar */}
                <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800">
                  <div className="bg-green-500" style={{ width: `${c.intent.buy}%` }} title={`buy ${c.intent.buy}%`} />
                  <div className="bg-yellow-500" style={{ width: `${c.intent.maybe}%` }} title={`maybe ${c.intent.maybe}%`} />
                  <div className="bg-red-500" style={{ width: `${c.intent.reject}%` }} title={`reject ${c.intent.reject}%`} />
                </div>
                <div className="flex justify-between text-[11px] text-zinc-500">
                  <span>{c.size} {t.clOfBuyers}</span>
                  <span>
                    {t.clOpportunity}:{' '}
                    <span className="font-semibold" style={{ color: c.avg_opportunity >= 65 ? '#22c55e' : c.avg_opportunity >= 45 ? '#eab308' : '#71717a' }}>
                      {c.avg_opportunity}/100
                    </span>
                  </span>
                </div>

                {c.top_problem && (
                  <p className="text-xs text-zinc-400">
                    <span className="text-zinc-500">{t.clMainProblem}:</span> {c.top_problem}
                  </p>
                )}
                {c.top_objection && (
                  <p className="text-xs text-zinc-400">
                    <span className="text-zinc-500">{t.clMainObjection}:</span> {c.top_objection}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      </div>

      <div className={desktopSectionClass('objections')}>
      {/* 3. Zid odbijanja */}
      <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
        <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-5">
          {t.sectionRejection}
        </h2>
        <div className="space-y-6">
          <RejectionBar reasons={report.rejection.reasons} tooltipLabel={t.objectionShare} />

          <div>
            <p className="text-sm text-zinc-400 mb-3">{t.skepticsVoices}</p>
            <div className="grid gap-4">
              {report.rejection.quotes.map((q, i) => (
                <blockquote
                  key={i}
                  className="rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-sm text-zinc-200 italic"
                >
                  &ldquo;{q}&rdquo;
                </blockquote>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Pitanja iz mase / discovery board */}
      <DiscoveryQuestionBoard
        questions={discoveryQuestions}
        labels={{
          title: t.discoveryBoardTitle,
          subtitle: t.discoveryBoardSubtitle,
          payer: t.discoveryPayer,
          user: t.discoveryUser,
          general: t.discoveryGeneral,
          context: t.discoveryContext,
          empty: t.discoveryEmpty,
        }}
      />
      </div>

      <div className={desktopSectionClass('action')}>
      {/* 5. Akcijski plan */}
      <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
        <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl mb-5">
          {t.actionPlan}
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: '🛠', label: t.product, text: report.action_plan.product, color: 'border-blue-800/40 bg-blue-950/20' },
            { icon: '📣', label: t.marketing, text: report.action_plan.marketing, color: 'border-purple-800/40 bg-purple-950/20' },
            { icon: '💰', label: t.pricing, text: report.action_plan.pricing, color: 'border-green-800/40 bg-green-950/20' },
          ].map(({ icon, label, text, color }) => (
            <div key={label} className={`rounded-xl border ${color} p-4 space-y-2`}>
              <div className="text-2xl">{icon}</div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{label}</p>
              <p className="text-sm text-zinc-200 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>
      </div>

      <div className={desktopSectionClass('deeper')}>
      {(showToolShelf || activeSection === 'deeper') && (
        <>
      {/* ── Grupa: dublje on-demand analize ── */}
      <div className="pt-2">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-[11px] uppercase tracking-widest text-zinc-500">{t.deeperTitle}</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>
        <p className="text-center text-xs text-zinc-600 mt-1.5">{t.deeperSubtitle}</p>
      </div>

      {/* Founder Strategy Review — on-demand */}
      <StrategySection
        report={report}
        form={form}
        language={language}
        onUpdateReport={onUpdateReport}
        labels={{
          title: t.strategyTitle,
          subtitle: t.strategySubtitle,
          run: t.strategyRun,
          running: t.strategyRunning,
          needData: t.strategyNeedData,
          error: t.strategyError,
          modes: t.strategyModes,
          recommendation: t.strategyRecommendation,
          strategicRead: t.strategyRead,
          doNow: t.strategyDoNow,
          notNow: t.strategyNotNow,
          nextSprint: t.strategyNextSprint,
          risks: t.strategyRisks,
          decisions: t.strategyDecisions,
          priority: t.strategyPriority,
        }}
      />

      {/* Market research s izvorima — on-demand */}
      <ResearchSection
        report={report}
        form={form}
        language={language}
        onUpdateReport={onUpdateReport}
        labels={{
          title: t.researchTitle,
          subtitle: t.researchSubtitle,
          run: t.researchRun,
          running: t.researchRunning,
          needData: t.researchNeedData,
          error: t.researchError,
          customPlaceholder: t.researchCustomPlaceholder,
          latest: t.researchLatest,
          findings: t.researchFindings,
          sources: t.researchSources,
          query: t.researchQuery,
          angles: t.researchAngles,
        }}
      />

      {/* Analiza cijene (Van Westendorp) — on-demand */}
      <PricingSection
        report={report}
        form={form}
        language={language}
        onUpdateReport={onUpdateReport}
        labels={{
          title: t.pricingTitle,
          subtitle: t.pricingSubtitle,
          run: t.pricingRun,
          running: t.pricingRunning,
          needData: t.pricingNeedData,
          range: t.pricingRange,
          optimal: t.pricingOptimal,
          yourPrice: t.pricingYourPrice,
          na: t.pricingNA,
          sample: t.pricingSample,
          tooCheap: t.pcTooCheap,
          cheap: t.pcCheap,
          expensive: t.pcExpensive,
          tooExpensive: t.pcTooExpensive,
          error: t.pricingError,
        }}
      />

      {/* Pitanja za prave intervjue — on-demand */}
      <InterviewSection
        report={report}
        form={form}
        language={language}
        onUpdateReport={onUpdateReport}
        labels={{
          title: t.interviewTitle,
          subtitle: t.interviewSubtitle,
          run: t.interviewRun,
          running: t.interviewRunning,
          needData: t.interviewNeedData,
          who: t.interviewWho,
          where: t.interviewWhere,
          tests: t.interviewTests,
          listen: t.interviewListen,
          copy: t.interviewCopy,
          copied: t.interviewCopied,
          error: t.interviewError,
        }}
      />

      {/* Plan za preokret — on-demand */}
      <ConversionSection
        report={report}
        form={form}
        language={language}
        onUpdateReport={onUpdateReport}
        labels={{
          title: t.conversionTitle,
          subtitle: t.conversionSubtitle,
          run: t.conversionRun,
          running: t.conversionRunning,
          needData: t.conversionNeedData,
          addresses: t.conversionAddresses,
          impact: t.conversionImpact,
          effortLabel: t.effortLabel,
          effortLow: t.effortLow,
          effortMed: t.effortMed,
          effortHigh: t.effortHigh,
          error: t.conversionError,
        }}
      />

      {/* Marketinški kutevi po skupini — on-demand */}
      <AnglesSection
        report={report}
        form={form}
        language={language}
        onUpdateReport={onUpdateReport}
        labels={{
          title: t.anglesTitle,
          subtitle: t.anglesSubtitle,
          run: t.anglesRun,
          running: t.anglesRunning,
          needData: t.anglesNeedData,
          channel: t.anglesChannel,
          proof: t.anglesProof,
          cta: t.anglesCta,
          preempt: t.anglesPreempt,
          targets: t.anglesTargets,
          error: t.anglesError,
        }}
      />

      {/* Conjoint — trade-off između paketa — on-demand */}
      <ConjointSection
        report={report}
        form={form}
        language={language}
        onUpdateReport={onUpdateReport}
        labels={{
          title: t.conjointTitle,
          subtitle: t.conjointSubtitle,
          run: t.conjointRun,
          running: t.conjointRunning,
          needData: t.conjointNeedData,
          importance: t.conjointImportance,
          bestPackage: t.conjointBestPackage,
          sample: t.conjointSample,
          error: t.conjointError,
        }}
      />
        </>
      )}
      </div>

      <div className={desktopSectionClass('personas')}>
      {/* 6. Persona Browser */}
      <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-black text-indigo-200 tracking-normal md:text-2xl">
              {t.personaBrowser}
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              {t.personaBrowserSubtitle}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start sm:self-center">
            {form && onUpdateReport && (
              <button
                onClick={() => {
                  setRegenerateError('');
                  setShowRegenerateConfirm(true);
                }}
                disabled={isRegenerating}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/50 disabled:text-indigo-200 text-white rounded-lg text-xs font-semibold border border-indigo-500/60 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isRegenerating ? t.regeneratingPersonas : t.regeneratePersonas}
              </button>
            )}
            <button
              onClick={() => setShowPersonas(!showPersonas)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer"
            >
              {showPersonas ? t.hideAllPersonas : t.showAllPersonas}
            </button>
          </div>
        </div>

        {showPersonas && (
          <div className="space-y-6 pt-4 border-t border-zinc-800 animate-fadeIn">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="flex-1 rounded-lg bg-zinc-950 border border-zinc-800 focus:border-zinc-700 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors"
              />
              <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-xs font-semibold self-start sm:self-auto">
                {(['all', 'buy', 'maybe', 'reject'] as const).map((dec) => (
                  <button
                    key={dec}
                    onClick={() => setDecisionFilter(dec)}
                    className={`px-3 py-1.5 rounded transition-colors cursor-pointer ${
                      decisionFilter === dec
                        ? dec === 'buy'
                          ? 'bg-green-600/20 text-green-400 border border-green-800/30'
                          : dec === 'maybe'
                          ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-800/30'
                          : dec === 'reject'
                          ? 'bg-red-600/20 text-red-400 border border-red-800/30'
                          : 'bg-indigo-600 text-white shadow-md'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {dec === 'all'
                      ? t.filterAll
                      : dec === 'buy'
                      ? t.buy
                      : dec === 'maybe'
                      ? t.maybe
                      : dec === 'reject'}
                  </button>
                ))}
              </div>
            </div>

            {/* Persona Grid */}
            {!report.reactions || report.reactions.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-6">{t.noReactionsData}</p>
            ) : (
              (() => {
                const personaCards = (report.personas || []).map((p) => {
                  const reaction = (report.reactions || []).find((r) => r.persona_id === p.id);
                  return { persona: p, reaction };
                });

                const filteredCards = personaCards.filter(({ persona, reaction }) => {
                  const matchesSearch =
                    persona.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    persona.industry.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (persona.region || '').toLowerCase().includes(searchTerm.toLowerCase());

                  const matchesDecision =
                    decisionFilter === 'all' || (reaction && reaction.decision === decisionFilter);

                  return matchesSearch && matchesDecision;
                });

                if (filteredCards.length === 0) {
                  return <p className="text-xs text-zinc-500 text-center py-6">No matching personas found.</p>;
                }

                return (
                  <div className="grid md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-1">
                    {filteredCards.map(({ persona, reaction }) => {
                      if (!reaction) return null;
                      const decColor =
                        reaction.decision === 'buy'
                          ? 'border-green-800/40 bg-green-950/10 text-green-400'
                          : reaction.decision === 'maybe'
                          ? 'border-yellow-800/40 bg-yellow-950/10 text-yellow-400'
                          : 'border-red-800/40 bg-red-950/10 text-red-400';

                      const decBadge =
                        reaction.decision === 'buy' ? t.buy : reaction.decision === 'maybe' ? t.maybe : t.reject;
                      const sideLabel =
                        persona.market_side === 'payer'
                          ? t.marketSidePayer
                          : persona.market_side === 'user'
                          ? t.marketSideUser
                          : persona.market_side === 'partner'
                          ? t.marketSidePartner
                          : t.marketSideBoth;

                      return (
                        <div
                          key={persona.id}
                          className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3.5 hover:border-zinc-700 transition-colors flex flex-col justify-between"
                        >
                          <div>
                            {/* Title and Decision Badge */}
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <h4 className="font-bold text-white text-sm leading-tight">{persona.role}</h4>
                                <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">
                                  {persona.industry} · {t.ageLabel}: {persona.age}
                                </p>
                                {persona.segment && (
                                  <span className="inline-block mt-1 text-[10px] text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 rounded px-1.5 py-0.5">
                                    {persona.segment}
                                  </span>
                                )}
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${decColor}`}>
                                {decBadge}
                              </span>
                            </div>

                            {/* Demographic Grid */}
                            <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400 bg-zinc-900/40 border border-zinc-800/50 rounded-lg p-2 mt-3">
                              <div>
                                <span className="text-zinc-600 mr-1 font-medium">{t.regionLabel}:</span>
                                <span className="text-zinc-300 font-semibold">{persona.region}</span>
                              </div>
                              <div>
                                <span className="text-zinc-600 mr-1 font-medium">{t.incomeLabel}:</span>
                                <span className="text-zinc-300 font-semibold capitalize">{persona.income}</span>
                              </div>
                              <div>
                                <span className="text-zinc-600 mr-1 font-medium">{t.techLiteracyLabel}:</span>
                                <span className="text-indigo-400 font-bold">{persona.tech_literacy}/10</span>
                              </div>
                              <div>
                                <span className="text-zinc-600 mr-1 font-medium">{t.buyerTypeLabel}:</span>
                                <span className="text-zinc-300 font-semibold capitalize">
                                  {persona.buyer_type.replace('_', ' ')}
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-600 mr-1 font-medium">{t.marketSideLabel}:</span>
                                <span className={`font-semibold ${
                                  persona.market_side === 'payer' || persona.market_side === 'partner'
                                    ? 'text-emerald-400'
                                    : persona.market_side === 'user'
                                    ? 'text-sky-400'
                                    : 'text-zinc-300'
                                }`}>
                                  {sideLabel}
                                </span>
                              </div>
                            </div>

                            {/* Reaction details */}
                            <div className="mt-3.5 space-y-2">
                              <blockquote className="border-l-2 border-zinc-700 pl-3 italic text-xs text-zinc-300">
                                &ldquo;{reaction.quote}&rdquo;
                              </blockquote>

                              <div className="text-[11px] leading-relaxed">
                                <span className="text-zinc-500 font-medium mr-1">{t.reasonLabel}:</span>
                                <span className="text-zinc-200">{reaction.main_reason}</span>
                              </div>

                              {reaction.willingness_to_pay && (
                                <div className="text-[11px]">
                                  <span className="text-zinc-500 font-medium mr-1">{t.willPayLabel}:</span>
                                  <span className="text-green-400 font-semibold">{reaction.willingness_to_pay}</span>
                                </div>
                              )}

                              {/* Specific objections / questions inside cards if they exist */}
                              {reaction.objections && reaction.objections.length > 0 && (
                                <div className="text-[11px]">
                                  <span className="text-red-400/80 font-semibold block mb-0.5">{t.objectionsLabel}:</span>
                                  <ul className="list-disc pl-4 space-y-0.5 text-zinc-400">
                                    {reaction.objections.map((o, idx) => (
                                      <li key={idx}>{o}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {reaction.questions && reaction.questions.length > 0 && (
                                <div className="text-[11px]">
                                  <span className="text-indigo-400/80 font-semibold block mb-0.5">{t.questionsLabel}:</span>
                                  <ul className="list-disc pl-4 space-y-0.5 text-zinc-400">
                                    {reaction.questions.map((q, idx) => (
                                      <li key={idx}>{q}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
