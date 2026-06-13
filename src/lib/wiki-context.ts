export interface WikiContext {
  title: string;
  extract: string;
  facts: string[];
  source: "ko" | "en" | "none";
  url: string | null;
}

const WIKI_UA = "AI-Debate-Arena/1.0 (educational; no-api-cost debate)";
const FETCH_TIMEOUT_MS = 4000;

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
    .slice(0, 6);
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
    if (summary && summary.facts.length > 0) return summary;
    if (summary) return summary;
  }
  return null;
}

export async function getWikiContext(topic: string): Promise<WikiContext | null> {
  const key = cacheKey(topic);
  if (cache.has(key)) return cache.get(key) ?? null;

  const queries = buildSearchQueries(topic);
  const wiki =
    (await fetchWikiForLang("ko", queries)) ??
    (await fetchWikiForLang("en", queries));

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

export function wikiCacheSize(): number {
  return cache.size;
}

export function prefetchWikiContext(topic: string): void {
  getWikiContext(topic).catch(() => {});
}

export { hashSeed, pickSeeded };
