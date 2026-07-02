import type { PersonaAttributes, PersonaReaction, EmergentCluster } from './types';

/**
 * Emergentno klasteriranje (LCA-lite) — ČISTA matematika, bez LLM-a.
 * Vektorizira reakcije (odluka, važnost, zadovoljstvo, opportunity, WTP, tech, prihod),
 * standardizira, pokreće k-means (k=2..4, biraj po silhouette), pa agregira po klasteru.
 * LLM kasnije samo LABELIRA klastere — brojke su iz koda.
 */

const MIN_N = 20; // ispod ovoga k-means je nestabilan → preskoči

type Row = {
  rid: number;
  vec: number[];
  r: PersonaReaction;
  p: PersonaAttributes;
};

const decisionScore = (d: PersonaReaction['decision']) => (d === 'buy' ? 1 : d === 'maybe' ? 0.5 : 0);
const incomeScore = (i: PersonaAttributes['income']) => (i === 'high' ? 1 : i === 'medium' ? 0.5 : 0);

/** Izvuci prvi broj iz WTP teksta (npr. "do 10€/mj" → 10), normaliziraj na 0..1. */
function wtpScore(s: string | undefined): number {
  if (!s) return 0;
  const m = s.replace(',', '.').match(/(\d+(\.\d+)?)/);
  if (!m) return 0;
  return Math.max(0, Math.min(1, parseFloat(m[1]) / 50));
}

function featurize(personas: PersonaAttributes[], reactions: PersonaReaction[]): Row[] {
  const byId = new Map(personas.map((p) => [p.id, p]));
  const rows: Row[] = [];
  for (const r of reactions) {
    const p = byId.get(r.persona_id);
    if (!p) continue;
    const imp = typeof r.importance === 'number' ? Math.max(1, Math.min(10, r.importance)) : 5;
    const sat = typeof r.satisfaction === 'number' ? Math.max(1, Math.min(10, r.satisfaction)) : 5;
    const opp = (imp + Math.max(imp - sat, 0)) / 20;
    rows.push({
      rid: r.persona_id,
      r,
      p,
      vec: [
        decisionScore(r.decision),
        imp / 10,
        sat / 10,
        opp,
        wtpScore(r.willingness_to_pay),
        (p.tech_literacy ?? 5) / 10,
        incomeScore(p.income),
      ],
    });
  }
  return rows;
}

/** Z-standardizacija po stupcu (std=0 → 0). */
function standardize(rows: Row[]): number[][] {
  const dim = rows[0].vec.length;
  const mean = new Array(dim).fill(0);
  const std = new Array(dim).fill(0);
  for (const row of rows) for (let j = 0; j < dim; j++) mean[j] += row.vec[j];
  for (let j = 0; j < dim; j++) mean[j] /= rows.length;
  for (const row of rows) for (let j = 0; j < dim; j++) std[j] += (row.vec[j] - mean[j]) ** 2;
  for (let j = 0; j < dim; j++) std[j] = Math.sqrt(std[j] / rows.length) || 1;
  return rows.map((row) => row.vec.map((v, j) => (v - mean[j]) / std[j]));
}

function dist2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
}

/** Determinističan RNG (mulberry32) za ponovljive klastere. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kmeans(X: number[][], k: number, seed: number) {
  const n = X.length;
  const rand = rng(seed);
  // k-means++ init
  const centroids: number[][] = [X[Math.floor(rand() * n)].slice()];
  while (centroids.length < k) {
    const d = X.map((x) => Math.min(...centroids.map((c) => dist2(x, c))));
    const sum = d.reduce((a, b) => a + b, 0) || 1;
    let target = rand() * sum;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      target -= d[i];
      if (target <= 0) {
        idx = i;
        break;
      }
    }
    centroids.push(X[idx].slice());
  }

  let assign = new Array(n).fill(0);
  for (let iter = 0; iter < 50; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = dist2(X[i], centroids[c]);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    // recompute
    const sums = Array.from({ length: k }, () => new Array(X[0].length).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      counts[assign[i]]++;
      for (let j = 0; j < X[0].length; j++) sums[assign[i]][j] += X[i][j];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      for (let j = 0; j < X[0].length; j++) centroids[c][j] = sums[c][j] / counts[c];
    }
    if (!changed) break;
  }

  let inertia = 0;
  for (let i = 0; i < n; i++) inertia += dist2(X[i], centroids[assign[i]]);
  return { assign, inertia };
}

/** Srednji silhouette (kvaliteta klasteriranja, -1..1). */
function silhouette(X: number[][], assign: number[], k: number): number {
  const n = X.length;
  const members: number[][] = Array.from({ length: k }, () => []);
  assign.forEach((c, i) => members[c].push(i));
  let total = 0;
  let counted = 0;
  for (let i = 0; i < n; i++) {
    const ci = assign[i];
    if (members[ci].length <= 1) continue; // singleton → s=0, preskoči
    const a =
      members[ci].filter((j) => j !== i).reduce((s, j) => s + Math.sqrt(dist2(X[i], X[j])), 0) /
      (members[ci].length - 1);
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === ci || members[c].length === 0) continue;
      const mean = members[c].reduce((s, j) => s + Math.sqrt(dist2(X[i], X[j])), 0) / members[c].length;
      b = Math.min(b, mean);
    }
    if (b === Infinity) continue;
    total += (b - a) / Math.max(a, b);
    counted++;
  }
  return counted ? total / counted : 0;
}

function mostCommon(items: string[]): string {
  const count = new Map<string, { text: string; n: number }>();
  for (const raw of items) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    const e = count.get(key) ?? { text: t, n: 0 };
    e.n++;
    count.set(key, e);
  }
  let best = '';
  let bestN = 0;
  for (const { text, n } of count.values()) if (n > bestN) ((bestN = n), (best = text));
  return best;
}

/** Vrati emergentne klastere BEZ labela (label/descriptor puni LLM kasnije). */
export function buildEmergentClusters(
  personas: PersonaAttributes[],
  reactions: PersonaReaction[]
): Omit<EmergentCluster, 'label' | 'descriptor'>[] {
  const rows = featurize(personas, reactions);
  if (rows.length < MIN_N) return [];

  const X = standardize(rows);

  // Biraj k po silhouette (2..4), uz nekoliko restartova
  let bestK = 2;
  let bestAssign: number[] = [];
  let bestSil = -Infinity;
  const maxK = Math.min(4, Math.floor(rows.length / 8));
  for (let k = 2; k <= Math.max(2, maxK); k++) {
    let kBestAssign: number[] = [];
    let kBestInertia = Infinity;
    for (let restart = 0; restart < 4; restart++) {
      const { assign, inertia } = kmeans(X, k, 1234 + restart * 97 + k * 13);
      if (inertia < kBestInertia) {
        kBestInertia = inertia;
        kBestAssign = assign;
      }
    }
    const sil = silhouette(X, kBestAssign, k);
    if (sil > bestSil) {
      bestSil = sil;
      bestK = k;
      bestAssign = kBestAssign;
    }
  }

  // Agregiraj po klasteru (sve iz koda)
  const total = rows.length;
  const clusters: Omit<EmergentCluster, 'label' | 'descriptor'>[] = [];
  for (let c = 0; c < bestK; c++) {
    const idxs = bestAssign.map((a, i) => (a === c ? i : -1)).filter((i) => i >= 0);
    if (idxs.length === 0) continue;
    const rs = idxs.map((i) => rows[i].r);
    const count = rs.length;
    const buy = rs.filter((r) => r.decision === 'buy').length;
    const maybe = rs.filter((r) => r.decision === 'maybe').length;
    const reject = count - buy - maybe;

    const imps = rs.map((r) => (typeof r.importance === 'number' ? r.importance : 5));
    const sats = rs.map((r) => (typeof r.satisfaction === 'number' ? r.satisfaction : 5));
    const avgImp = imps.reduce((a, b) => a + b, 0) / count;
    const avgSat = sats.reduce((a, b) => a + b, 0) / count;
    const avgOpp = Math.round(((avgImp + Math.max(avgImp - avgSat, 0)) / 20) * 100);

    clusters.push({
      id: c,
      size: count,
      size_pct: Math.round((count / total) * 100),
      intent: {
        buy: Math.round((buy / count) * 100),
        maybe: Math.round((maybe / count) * 100),
        reject: Math.round((reject / count) * 100),
      },
      avg_opportunity: avgOpp,
      avg_importance: Math.round(avgImp * 10) / 10,
      avg_satisfaction: Math.round(avgSat * 10) / 10,
      top_objection: mostCommon(rs.flatMap((r) => r.objections ?? [])),
      top_problem: mostCommon(rs.map((r) => r.problem_to_solve ?? '').filter(Boolean)),
      persona_ids: idxs.map((i) => rows[i].rid),
    });
  }

  // najveći klaster prvi
  return clusters.sort((a, b) => b.size - a.size);
}
