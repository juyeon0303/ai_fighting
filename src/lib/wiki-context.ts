import type { DebateMessage } from "./types";
import { factViolatesGroundTruth } from "./domain-ground-truth";

export interface WikiContext {
  title: string;
  extract: string;
  facts: string[];
  source: "ko" | "en" | "none";
  url: string | null;
}

const WIKI_UA = "AI-Debate-Arena/1.0 (educational; no-api-cost debate)";
const FETCH_TIMEOUT_MS = 2500;

const cache = new Map<string, WikiContext | null>();

function cacheKey(query: string): string {
  return query.toLowerCase().trim();
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickSeeded<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function parseFacts(extract: string): string[] {
  return extract
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 12 && s.length <= 140)
    .slice(0, 8);
}

function normToken(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/** 동음이의·목록 문서 거부 */
export function isDisambiguationWiki(wiki: WikiContext): boolean {
  const blob = `${wiki.title} ${wiki.extract}`;
  return (
    /동음이의|may refer to|다음 사람|를 가리킨다|다음을 가리킨다|이 목록은|둘 이상|여러 명|는 다음/.test(
      blob,
    ) || wiki.title.includes("동음이의")
  );
}

/** 위키 결과가 검색어와 관련 있는지 */
export function wikiRelatesToQuery(query: string, wiki: WikiContext): boolean {
  if (isDisambiguationWiki(wiki)) return false;

  const tokens = query.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [];
  if (tokens.length === 0) return wiki.facts.length > 0 || wiki.extract.length >= 20;

  const blob = normToken(`${wiki.title} ${wiki.extract}`);
  const first = tokens[0];
  if (first) {
    const primary = normToken(first);
    if (primary.length >= 2 && blob.includes(primary)) return true;
  }

  return tokens.some((t) => {
    const n = normToken(t);
    return n.length >= 2 && blob.includes(n);
  });
}

/** 복합 주제(치킨 vs 피자 등) — 한쪽이라도 맞으면 OK */
export function wikiRelatesToTopicQuery(
  query: string,
  wiki: WikiContext,
): boolean {
  const parts = query
    .split(/\s*(?:vs\.?|VS|대|\/|·|\|)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  if (parts.length >= 2) {
    return parts.some((p) => wikiRelatesToQuery(p, wiki));
  }
  return wikiRelatesToQuery(query, wiki);
}

/** 백과사전·정의문·동음이의 오매칭 — 토론에 부적합 */
export function isUnusableWikiFact(fact: string): boolean {
  if (fact.length > 52) return true;
  return /영어:|이탈리아어|문화어|라틴어|IPA:|동음이의|다음 사람|를 가리킨다|문장:\s*[A-Za-z]|\([A-Za-z]{3,}[^)]{8,}\)|洋瓷|陶瓷|兩者|도자기|뜻은 다음과 같다/.test(
    fact,
  );
}

/** 팩트가 해당 대상과 관련 있는지 */
export function factRelatesToEntity(
  entityName: string,
  fact: string,
  wiki?: WikiContext | null,
): boolean {
  const tokens = entityName.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [];
  const blob = normToken(`${wiki?.title ?? ""} ${fact}`);
  if (tokens.length === 0) return true;
  return tokens.some((t) => blob.includes(normToken(t)));
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": WIKI_UA },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchWikiTitle(
  lang: "ko" | "en",
  query: string,
): Promise<string | null> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php` +
    `?action=opensearch&search=${encodeURIComponent(query)}` +
    `&limit=1&namespace=0&format=json`;

  const data = await fetchJson<[string, string[], string[], string[]]>(url);
  const title = data?.[1]?.[0];
  return title?.trim() || null;
}

async function fetchWikiSummary(
  lang: "ko" | "en",
  title: string,
): Promise<WikiContext | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const data = await fetchJson<{
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  }>(url);

  const extract = data?.extract?.trim();
  if (!data || !extract || extract.length < 20) return null;

  return {
    title: data.title ?? title,
    extract,
    facts: parseFacts(extract),
    source: lang,
    url: data.content_urls?.desktop?.page ?? null,
  };
}

function buildSearchQueries(topic: string): string[] {
  const queries = new Set<string>();
  queries.add(topic.trim());

  const stripped = topic.replace(/[?？!！.。]/g, "").trim();
  if (stripped) queries.add(stripped);

  const nounPhrase = stripped
    .replace(/(?:은|는|이|가)\s*(?:실제로\s*)?(?:가능|될|맞)(?:할까|한가|하나|할까요).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (nounPhrase && nounPhrase.length >= 2) queries.add(nounPhrase);

  const words = topic.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [];
  for (const w of words.slice(0, 4)) {
    if (w.length >= 2) queries.add(w);
  }

  return [...queries].filter((q) => q.length >= 2).slice(0, 6);
}

async function fetchWikiForLang(
  lang: "ko" | "en",
  queries: string[],
): Promise<WikiContext | null> {
  for (const query of queries) {
    const title = await searchWikiTitle(lang, query);
    if (!title) continue;

    const summary = await fetchWikiSummary(lang, title);
    if (!summary) continue;
    if (!wikiRelatesToTopicQuery(query, summary)) continue;
    return summary;
  }
  return null;
}

export async function getWikiContext(topic: string): Promise<WikiContext | null> {
  const key = cacheKey(topic);
  if (cache.has(key)) return cache.get(key) ?? null;

  const queries = buildSearchQueries(topic);
  const hasHangul = /[가-힣]/.test(topic);

  const wiki = hasHangul
    ? await fetchWikiForLang("ko", queries)
    : ((await fetchWikiForLang("ko", queries)) ??
      (await fetchWikiForLang("en", queries)));

  cache.set(key, wiki);
  return wiki;
}

export function pickWikiFact(wiki: WikiContext, seed: number): string {
  if (wiki.facts.length === 0) {
    const short =
      wiki.extract.length > 90 ? `${wiki.extract.slice(0, 87)}…` : wiki.extract;
    return short;
  }
  return pickSeeded(wiki.facts, seed);
}

export function wikiSnippet(fact: string, maxLen = 40): string {
  const cleaned = fact.replace(/\.$/, "").trim();
  if (cleaned.length <= maxLen) return cleaned;
  const cut = cleaned.slice(0, maxLen);
  const lastBreak = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf(","));
  if (lastBreak > 12) return cut.slice(0, lastBreak);
  return `${cut}…`;
}

function factAlreadyUsed(fact: string, history: DebateMessage[]): boolean {
  const key = fact.replace(/\s+/g, " ").trim().slice(0, 22).toLowerCase();
  if (key.length < 8) return false;
  const blob = history.map((m) => m.content).join(" ").toLowerCase();
  return blob.includes(key);
}

/** 토론에서 아직 안 쓴 위키 사실 선택 */
export function pickFreshWikiFact(
  wiki: WikiContext,
  history: DebateMessage[],
  seed: number,
  entityName?: string,
): string | null {
  if (wiki.facts.length === 0) {
    const short = wikiSnippet(wiki.extract, 50);
    if (factAlreadyUsed(short, history)) return null;
    if (entityName && !factRelatesToEntity(entityName, short, wiki)) return null;
    if (isUnusableWikiFact(short)) return null;
    return short;
  }
  for (let i = 0; i < Math.min(wiki.facts.length, 8); i++) {
    const fact = pickSeeded(wiki.facts, seed + i);
    if (factAlreadyUsed(fact, history)) continue;
    if (entityName && !factRelatesToEntity(entityName, fact, wiki)) continue;
    if (entityName && factViolatesGroundTruth(entityName, fact)) continue;
    if (isUnusableWikiFact(fact)) continue;
    return wikiSnippet(fact, 40);
  }
  return null;
}

export function wikiCacheSize(): number {
  return cache.size;
}

export function prefetchWikiContext(topic: string): void {
  getWikiContext(topic).catch(() => {});
  import("./debate-sources").then(({ prefetchDebateSources }) => {
    prefetchDebateSources(topic);
  });
}

export { hashSeed, pickSeeded };
