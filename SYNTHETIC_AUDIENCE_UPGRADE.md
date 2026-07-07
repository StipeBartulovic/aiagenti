# Plan: Sintetička publika → profi razina

> Cilj: podići "50 sintetičkih korisnika" s razine *demografskog upitnika* na razinu *znanstveno strukturirane sintetičke fokus grupe* (JTBD, Opportunity Score, conjoint, emergentni klasteri, anti-sikofancija).

---

## 1. Audit trenutnog stanja (gdje smo)

| Sloj | Datoteka | Što imamo | Što fali (po tekstu) |
|------|----------|-----------|----------------------|
| Persone | `lib/personas.ts` | Demografija: age, role, industry, tech, income, buyer_type, region, personality, segment | **Psihografija** (vrijednosti, stil života, hobiji), **ponašanje** (kupovne navike, stil odluke), **pain points, strahovi, ambicije, brendovi kojima vjeruje** |
| Reakcije | `lib/engine.ts` `getBatchReactions` | decision (buy/maybe/reject), main_reason, objections, questions, quote, WTP | **JTBD** (koji problem, koja alternativa, koje sumnje), **Opportunity Score** (važnost vs zadovoljstvo), **conjoint trade-offovi** |
| Score | `scoreFromCounts` | ✓ Brojke iz koda (anti-halucinacija) | Opportunity Score, importance/satisfaction skale — sve iz koda |
| Segmenti | `buildSegmentStats` | **Pre-definirani** (AudiencePicker bira publike unaprijed) | **Emergentni** klasteri iz STVARNIH odgovora (LCA/k-means) — "od 72 agenta našli smo 3 prirodne skupine" |
| Cijena | `lib/pricing.ts` | ✓ Van Westendorp (on-demand) | **Conjoint** (izbor između paketa, part-worth utilities) |
| Anti-halucinacija | `validateIdeaContext`, cynic/skeptic | Gatekeeper + skeptični tipovi | **Anti-sikofancija prompt**, **anti-persone** (namjerno protiv), kalibracija na realne base-rate |
| Izlaz | `synthesize` | summary, audience, rejection, questions, action_plan, segments | **Marketinški kutevi po klasteru** ("ušteda vremena" vs "status"), **kampanjski profili** |

**Ključni princip koji ZADRŽAVAMO:** sve metrike (score, %, opportunity, veličine klastera) računaju se U KODU iz odgovora — LLM daje samo kvalitativni tekst/labele. To je naša glavna obrana od "iluzije kvalitete AI anketa" (točka 5).

---

## 2. Fazni plan

### FAZA 1 — Jezgra: JTBD + Opportunity Score + anti-sikofancija (točke 2 i 5)
*Najveći leverage, umjeren trošak. Mijenja TEMELJNO pitanje s "sviđa li ti se?" na "koji posao, koja alternativa, koliko važno, koliko (ne)zadovoljan".*

**Tip izmjene — `PersonaReaction` (types.ts):**
```ts
// JTBD jezgra
problem_to_solve: string;       // koji problem proizvod "zapošljava" riješiti
current_alternative: string;    // što bi koristio da nema ovog (status quo)
doubts: string[];               // sumnje PRIJE kupnje
// Numeričke skale (1-10) — ULAZ za Opportunity Score, računat u kodu
importance: number;             // koliko je važno riješiti taj problem
satisfaction: number;           // koliko je zadovoljan postojećim alternativama
```

**Opportunity Score (u kodu, Ulwick ODI formula):**
```
opportunity = importance + max(importance − satisfaction, 0)   // 0–20, skalirati na 0–100
```
Visok = problem važan A tržište loše rješava → tu je prilika. Računa se po pers:oni, agregira po proizvodu i (kasnije) po klasteru.

**Anti-sikofancija (prompt u `getBatchReactions`):**
- Eksplicitno: "Većina proizvoda propadne. Budi kritičan, ne pristojan. Odbij ako stvarno ne bi platio svojim novcem."
- Kalibracija base-rate: ubaci referentne brojke (npr. tipičan trial→paid 15–25%) da model ne napuhuje.
- **Anti-persone:** dodati `PersonaAttributes.disposition?: 'hostile' | 'indifferent' | 'open'`; ~15% persona dobiva `hostile` (default reject osim ako je ponuda uistinu uvjerljiva) — pojačava postojeće skeptike.

**Izlaz korisniku (Faza 1):** novi blok "Opportunity Score" na dashboardu + JTBD razrada (koje alternative kupci spominju = tvoja prava konkurencija).

**Datoteke:** `types.ts`, `engine.ts` (reaction schema + opportunity izračun), `Dashboard.tsx` (novi blok), backward-compat `?.` guardovi.
**Trošak:** veći JSON po pers/oni → batch 10→8, maxTokens 4000→6000.

---

### FAZA 2 — Dubina persona + emergentni klasteri (točke 1 i 4)
*Psihografija čini reakcije uvjerljivijima; emergentno klasteriranje pretvara 72 odgovora u 3 jasne skupine s postocima.*

**Točka 1 — psihografija (`PersonaAttributes`):**
```ts
values: string[];          // npr. ["efikasnost","status","sigurnost"]
decision_style: 'analytical' | 'impulsive' | 'social_proof' | 'risk_averse';
pain_points: string[];
trusted_brands: string[];  // brendovi kojima već vjeruje
```
Generacija: **hibridno** — `/api/audiences` već vraća SegmentSpec po publici; proširiti da vrati i 2-3 **psihografska arhetipa** po segmentu (pain points, vrijednosti, brendovi), pa kod deterministički dodjeljuje arhetip personama unutar segmenta (varijacija kao i sad). Bez novog troška po pers/oni — arhetipi se generiraju jednom po segmentu. Hrane reaction prompt (bogatiji kontekst = vjerodostojnija simulacija).

**Točka 4 — emergentno klasteriranje (LCA-lite, u kodu):**
- Vektoriziraj svaku reakciju: [decision→broj, importance, satisfaction, opportunity, WTP→broj, tech, income→broj, + one-hot ključnih objection tema].
- **k-means u čistom TS-u** (`lib/clustering.ts`), standardizacija featura, k=2–4 (biraj po silhouette/elbow heuristici).
- Kod računa: veličinu klastera (%), centroid (po čemu se razlikuju), dominantne objection teme.
- **LLM labelira** svaki klaster ("Cjenovno osjetljivi pragmatici", "Spremni platiti ali mrze kompleksnost") — JEDAN poziv, samo tekst.
- **Razlika od postojećih segmenata:** ovi nastaju IZ ODGOVORA, ne unaprijed. Oba imaju vrijednost: pre-definirani = "tko reagira", emergentni = "tko se prirodno grupira".

**Tipovi:** `EmergentCluster { id, label, size_pct, defining_traits[], avg_opportunity, top_objection, intent, persona_ids[] }`, `ValidationReport.clusters?`.

**Izlaz korisniku (Faza 2):** "Od 72 agenta, 3 prirodne skupine" — kartice s %, čime se vode, prosječni Opportunity Score po skupini → poduzetnik vidi na koju se isplati fokusirati.

**Datoteke:** `types.ts`, `lib/clustering.ts` (NOVO, čista funkcija), `personas.ts` (psihografija), `app/api/audiences/route.ts` (arhetipi), `engine.ts` (klasteriranje + label poziv), `Dashboard.tsx`.

---

### FAZA 3 — Napredna analitika + taktički izlaz (točke 3 i 6)
*Conjoint + marketinški kutevi po klasteru = ono što agencija naplati.*

**Točka 6 — marketinški kutevi + kampanjski profili (najlakše, ovisi o Fazi 2):**
- Po emergentnom klasteru, iz njihovih reakcija + opportunity + vrijednosti izvedi **najjači kut** ("Kut A: ušteda vremena" vs "Kut B: status").
- Kampanjski profil: tko, gdje ih naći, glavna poruka, koji prigovor preempt-ati, kanal.
- Tip `MarketingAngle { cluster_label, angle, message, channel, preempt_objection }`, `ValidationReport.angles?`.
- Može u glavni `synthesize` (jer klasteri već postoje) ili kao on-demand leća.

**Točka 3 — conjoint analiza (najteže, zasebna on-demand leća kao pricing):**
- Definiraj 3–4 atributa s razinama (npr. Cijena {9,19,39€}, Skup značajki {osnovni, pro}, Podrška {email, prioritet}).
- Generiraj N paketa (choice sets), svaka persona BIRA između paketa (forsiran trade-off, ne "sviđa mi se").
- Kod računa **relativnu važnost atributa** (part-worth utility iz izbora — frekvencijska aproksimacija, ne puni HB model).
- Integrira VW (cijena kao jedan atribut) → "koliko im je cijena bitna NASPRAM značajki".
- `lib/conjoint.ts` (čista matematika), `/api/conjoint`, `Dashboard.tsx ConjointSection`. Isti uzorak kao Van Westendorp.

---

## 3. Skala (50 → ?)

Tekst spominje 1000 agenata. Emergentno klasteriranje i Opportunity Score postaju **statistički vrjedniji s većim N**.

**ODLUKA (donesena): dvije razine.**
- **Free tier:** ~100 agenata (3 segmenta × ~33), batch 8 → ~13 paralelnih DeepSeek poziva, latencija ~ista uz `Promise.all`.
- **Paid "Deep run":** 300+ agenata — najčvršći klasteri, najprecizniji Opportunity Score.
- Implementacija: motor parametriziran s `depth: 'standard' | 'deep'` (mapira na N + batch). **`runEngine` i `/api/validate` dobivaju `depth` parametar ODMAH** — tako je engine spreman za oba tiera.
- **Uvjet (blokira tek naplatu, ne engine):** stvarno *gating-anje* paid tiera traži Stripe + kvote, što treba TVOJ Stripe račun/ključeve (ne mogu autonomno). Dok Stripe ne legne: `depth` postoji kao parametar, ali paywall/kvota su naknadni sloj. Engine i obje razine grade se neovisno o tome.
- Trošak je linearan s N × (veći JSON po pers/oni). Po potrebi p-limit na paralelne pozive da ne udarimo rate-limit.

---

## 4. Rizici i kompatibilnost

- **Backward-compat:** stari spremljeni izvještaji nemaju nova polja → svuda `?.` guard + uvjetni render (kao za pricing/interview/conversion).
- **Trošak/latencija:** bogatije reakcije = veći tokeni. Mjeriti, po potrebi smanjiti batch.
- **Kvaliteta klastera:** k-means na malom N (npr. <40) je nestabilan → minimalni N prag prije nego prikažemo emergentne klastere (ispod praga: samo pre-definirani segmenti).
- **Opportunity Score realizam:** kalibrirati skalu da ne bude svaki proizvod "velika prilika" — anti-sikofancija (Faza 1) je preduvjet.

---

## 5. Preporučeni redoslijed isporuke

1. **Faza 1** (JTBD + Opportunity + anti-sikofancija) — temelj, odmah vidljiva vrijednost, hrani sve ostalo.
2. **Faza 2** (psihografija + emergentni klasteri) — "3 prirodne skupine" je wow-moment za poduzetnika.
3. **Faza 3** (kutevi + conjoint) — kutevi prvi (jeftino, ovisi o klasterima), conjoint zadnji (najkompleksniji).

Svaka faza je samostalno isporučiva i verificirana (tsc + živi DeepSeek poziv), bez rušenja postojećeg toka.
