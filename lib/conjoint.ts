import type { ConjointAttribute, ConjointAnalysis } from './types';

/**
 * Conjoint (choice-based) — ČISTA matematika, bez LLM-a.
 * Dizajn izbora (tasks × profiles), pa "counts analiza": part-worth razine =
 * udio izbora kad je razina prisutna (chosen/available); važnost atributa =
 * raspon part-worthova, normaliziran da svi atributi daju ~100%.
 * (Frekvencijska aproksimacija — nije puni HB model, ali valjana za agregatni uvid.)
 */

/** Determinističan RNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dizajn: tasks[t] = lista profila; profil = indeks razine po atributu. Profili u zadatku su različiti. */
export function generateDesign(
  attributes: ConjointAttribute[],
  numTasks: number,
  profilesPerTask: number,
  seed = 7
): number[][][] {
  const rand = rng(seed);
  const maxCombos = attributes.reduce((p, a) => p * Math.max(1, a.levels.length), 1);
  const perTask = Math.min(profilesPerTask, maxCombos);
  const tasks: number[][][] = [];

  for (let t = 0; t < numTasks; t++) {
    const profiles: number[][] = [];
    const seen = new Set<string>();
    let guard = 0;
    while (profiles.length < perTask && guard++ < 200) {
      const prof = attributes.map((a) => Math.floor(rand() * a.levels.length));
      const key = prof.join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      profiles.push(prof);
    }
    tasks.push(profiles);
  }
  return tasks;
}

/** Izbor jedne persone: za svaki task indeks odabranog profila (ili -1 = ništa). */
export interface ChoiceRow {
  picks: number[];
}

export function computeConjoint(
  attributes: ConjointAttribute[],
  tasks: number[][][],
  choices: ChoiceRow[],
  sampleSize: number
): ConjointAnalysis {
  const avail = attributes.map((a) => a.levels.map(() => 0));
  const chosen = attributes.map((a) => a.levels.map(() => 0));

  for (const row of choices) {
    for (let t = 0; t < tasks.length; t++) {
      const profiles = tasks[t];
      if (!profiles?.length) continue;
      // svaka razina u svim profilima zadatka je "dostupna" toj personi
      for (const prof of profiles) {
        prof.forEach((lvl, ai) => {
          if (avail[ai]?.[lvl] !== undefined) avail[ai][lvl]++;
        });
      }
      const pick = row.picks?.[t];
      if (pick == null || pick < 0 || pick >= profiles.length) continue;
      profiles[pick].forEach((lvl, ai) => {
        if (chosen[ai]?.[lvl] !== undefined) chosen[ai][lvl]++;
      });
    }
  }

  const ranges: number[] = [];
  const attrResults = attributes.map((a, ai) => {
    const shares = a.levels.map((_, li) => (avail[ai][li] > 0 ? chosen[ai][li] / avail[ai][li] : 0));
    const maxS = Math.max(...shares);
    const minS = Math.min(...shares);
    ranges.push(maxS - minS);
    const bestIdx = shares.indexOf(maxS);
    return {
      name: a.name,
      levels: a.levels.map((lv, li) => ({
        level: lv,
        utility: Math.round((shares[li] / (maxS || 1)) * 100), // 0-100, najbolja=100
      })),
      best_level: a.levels[bestIdx] ?? a.levels[0],
    };
  });

  const totalRange = ranges.reduce((s, r) => s + r, 0) || 1;
  const attributesOut = attrResults.map((a, ai) => ({
    name: a.name,
    importance: Math.round((ranges[ai] / totalRange) * 100),
    levels: a.levels,
    best_level: a.best_level,
  }));

  return {
    attributes: attributesOut,
    sample_size: sampleSize,
    tasks: tasks.length,
    winning_combo: attributesOut.map((a) => ({ attribute: a.name, level: a.best_level })),
    verdict: '',
  };
}
