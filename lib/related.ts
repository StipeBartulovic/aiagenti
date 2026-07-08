/**
 * Vektorsko povezivanje zapisa biznis plana — TF-IDF + kosinusna sličnost.
 * Radi potpuno lokalno i besplatno (bez embedding modela): svaki zapis postane
 * rijedak vektor težina pojmova, a povezanost je kosinus kuta između vektora.
 * Na količini podataka jednog projekta (deseci zapisa) daje pouzdane veze;
 * sučelje je dovoljno općenito da se kasnije zamijeni pravim embeddinzima.
 */

export interface RelatedItem {
  id: string;
  text: string;
}

export interface RelatedLink {
  id: string;
  /** 0-1, kosinusna sličnost */
  score: number;
}

const STOPWORDS = new Set([
  // hr
  'koji', 'koja', 'koje', 'kojih', 'kako', 'zbog', 'treba', 'ima', 'nema', 'jesu', 'nije',
  'ovaj', 'ova', 'ovo', 'taj', 'ta', 'to', 'te', 'ti', 'se', 'su', 'za', 'na', 'da', 'ne',
  'ili', 'ali', 'pa', 'po', 'od', 'do', 'u', 'i', 'je', 'biti', 'bio', 'bila', 'bilo',
  'kao', 'sto', 'sve', 'jos', 'vec', 'preko', 'kroz', 'bez', 'kod', 'nakon', 'prije',
  // en
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was', 'has', 'have',
  'been', 'will', 'would', 'should', 'could', 'not', 'but', 'about', 'more', 'than',
]);

/** Makni dijakritike (č/ć→c, š→s, ž→z, đ→d) da se "korisnici" i "korisnići" poklope. */
function stripDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

/**
 * Lagani "stem" za hrvatski/engleski: duže riječi režemo na prefiks od 6 znakova,
 * čime se padeži i množine ("korisnika", "korisnicima", "korisnici") svedu na isti pojam.
 */
function stem(token: string): string {
  return token.length > 6 ? token.slice(0, 6) : token;
}

function tokenize(text: string): string[] {
  return stripDiacritics(text.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token))
    .map(stem);
}

type SparseVector = Map<string, number>;

function cosine(a: SparseVector, b: SparseVector): number {
  // iteriraj po manjem vektoru
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = big.get(term);
    if (other) dot += weight * other;
  }
  if (dot === 0) return 0;
  let normA = 0;
  for (const weight of a.values()) normA += weight * weight;
  let normB = 0;
  for (const weight of b.values()) normB += weight * weight;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Za svaki zapis vrati do `topK` najsličnijih drugih zapisa (score >= minScore).
 * O(n²) po parovima — na veličini jednog biznis plana trenutno.
 */
export function buildRelatedIndex(
  items: RelatedItem[],
  topK = 3,
  minScore = 0.22
): Map<string, RelatedLink[]> {
  const docs = items.map((item) => ({ id: item.id, tokens: tokenize(item.text) }));

  // document frequency po pojmu
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc.tokens)) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const n = docs.length;
  const vectors: SparseVector[] = docs.map((doc) => {
    const tf = new Map<string, number>();
    for (const term of doc.tokens) tf.set(term, (tf.get(term) ?? 0) + 1);
    const vector: SparseVector = new Map();
    for (const [term, count] of tf) {
      const idf = Math.log((n + 1) / ((df.get(term) ?? 0) + 1)) + 1;
      vector.set(term, count * idf);
    }
    return vector;
  });

  const index = new Map<string, RelatedLink[]>();
  for (let i = 0; i < docs.length; i += 1) {
    const links: RelatedLink[] = [];
    for (let j = 0; j < docs.length; j += 1) {
      if (i === j) continue;
      const score = cosine(vectors[i], vectors[j]);
      if (score >= minScore) links.push({ id: docs[j].id, score });
    }
    links.sort((a, b) => b.score - a.score);
    index.set(docs[i].id, links.slice(0, topK));
  }
  return index;
}
