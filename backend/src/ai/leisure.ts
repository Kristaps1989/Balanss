import type Anthropic from '@anthropic-ai/sdk';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import type { EventWhen, LeisureItem, LeisureKind, MovieWhere } from '../../../shared/api';
import { genreLabel } from '../../../shared/leisure';
import { AiCallError, callStructured, FALLBACK_BETA, logAiFailure, type ClaudeClient } from './claude';

/**
 * Free-time suggestions: films (cinema / Go3 / anywhere), books and local events.
 *
 * Live listings come from Claude's web search in two steps:
 *   1. a search turn (web_search tool, approximate location = the user's city) that writes
 *      down what it found, with links and start times;
 *   2. a structured-output turn that turns those notes into items.
 * The server then keeps only what it can check: links must be among the URLs the search
 * actually returned, and screenings/events must start at least 30 minutes from now and
 * inside the chosen window. Nothing about the user is sent except the city and choices.
 * When search finds nothing, curated books and timeless ideas are shown; events are never
 * invented.
 */

export interface LeisureQuery {
  kind: LeisureKind;
  genre: string;
  where: MovieWhere | null;
  when: EventWhen | null;
  city: string;
  now: Date;
  /** Earliest acceptable start (now + 30 min) and end of the window, for timed items. */
  earliest: Date;
  windowEnd: Date;
  /** Local date (YYYY-MM-DD) and weekday name, for the prompt. */
  localDate: string;
}

export interface LeisureResult {
  items: LeisureItem[];
  live: boolean;
  note: string | null;
}

export interface LeisureEngine {
  suggest(q: LeisureQuery, log: FastifyBaseLogger): Promise<LeisureResult>;
}

export const MIN_LEAD_MIN = 30;
const MAX_ITEMS = 6;
const UNSUITABLE = /kazino|azartspēl|alkohol|degustācij|pub crawl|striptīz|casino|gambling|strip club/i;

/** Timed items need a start time in the window; links are required where the user acts on them. */
export const needsTime = (q: Pick<LeisureQuery, 'kind' | 'where'>) => q.kind === 'event' || (q.kind === 'movie' && q.where === 'cinema');
const needsUrl = (q: Pick<LeisureQuery, 'kind' | 'where'>) => q.kind === 'event' || (q.kind === 'movie' && q.where !== 'any');

// ---------------------------------------------------------------- validation

function normUrl(u: string): string | null {
  try {
    const x = new URL(u.trim());
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return null;
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return null;
  }
}

const LISTING_PATH = /^\/(?:lv\/|en\/|ru\/)?(?:movies?|filmas?|films?|kino|cinema|events?|pasakumi|pasākumi|afisa|afiša|search|meklet|meklēt|catalog|katalogs|books?|gramatas|grāmatas|tv|series|serialis?)?\/?$/i;

/**
 * True when a URL points at one specific film, book or event (what the user can act on),
 * not a homepage, a listing/category page or a search page.
 */
export function isItemPage(u: string): boolean {
  try {
    const x = new URL(u);
    if (/[?&](q|s|query|search)=/i.test(x.search)) return false;
    if (LISTING_PATH.test(x.pathname)) return false;
    const segs = x.pathname.split('/').filter(Boolean);
    return segs.length >= 2 || (segs.length === 1 && (segs[0]!.length >= 8 || /\d/.test(segs[0]!))) || /[?&]id=\d+/i.test(x.search);
  } catch {
    return false;
  }
}

/**
 * Keep only listings the server can stand behind (see module comment). `allowedUrls` are
 * the URLs the web search returned; pass null for curated data (links are then dropped
 * unless the item already came with a checked one).
 */
export function validateListings(raw: RawListing[], q: LeisureQuery, allowedUrls: Set<string> | null): LeisureItem[] {
  const allowed = new Map<string, string>();
  for (const u of allowedUrls ?? []) {
    const n = normUrl(u);
    if (n) allowed.set(n, u);
  }
  const seen = new Set<string>();
  const out: LeisureItem[] = [];
  for (const r of raw) {
    const title = r.title.trim().slice(0, 100);
    if (!title || UNSUITABLE.test(`${r.title} ${r.description} ${r.venue ?? ''}`)) continue;

    let url: string | null = null;
    if (r.url) {
      const n = normUrl(r.url);
      if (n && allowedUrls === null) url = r.url;
      else if (n && allowed.has(n)) url = allowed.get(n)!;
      // Live links must open the item itself, not a homepage or a listing (a link the user can't act on is worse than none).
      if (url && allowedUrls !== null && !isItemPage(url)) url = null;
    }
    if (q.kind === 'movie' && q.where === 'go3') {
      if (!url || !/(^|\.)go3\.lv$/.test(new URL(url).hostname)) continue;
    }
    if (needsUrl(q) && !url) continue;

    let startsAt: string | null = null;
    if (needsTime(q)) {
      const t = r.startsAt ? new Date(r.startsAt) : null;
      if (!t || Number.isNaN(t.getTime())) continue;
      if (t < q.earliest || t > q.windowEnd) continue; // already started, starting too soon, or outside the window
      startsAt = t.toISOString();
    }

    const key = `${title.toLowerCase()}|${startsAt ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${r.provider}-${out.length}-${Buffer.from(key).toString('base64url').slice(0, 16)}`,
      title,
      subtitle: r.subtitle?.trim().slice(0, 80) || null,
      description: r.description.trim().slice(0, 240),
      startsAt,
      venue: r.venue?.trim().slice(0, 80) || null,
      url,
      provider: r.provider,
    });
  }
  out.sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
  return out.slice(0, MAX_ITEMS);
}

// ---------------------------------------------------------------- Claude: search + extract

const ListingSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  description: z.string(),
  startsAt: z.string().nullable(),
  venue: z.string().nullable(),
  url: z.string().nullable(),
  provider: z.enum(['cinema', 'go3', 'streaming', 'book', 'event', 'idea']),
});
export type RawListing = z.infer<typeof ListingSchema>;
const ListingsSchema = z.object({ items: z.array(ListingSchema) });

const SEARCH_SYSTEM = `You find real things to do for a user of Balanss, a Latvian wellbeing app. You search the web and report only what you actually found, with links. Never invent titles, venues, times or links. Prefer official sources (cinema and venue websites, go3.lv, biļešu tirgotāji, city event calendars). Suggestions must suit a calm, healthy free-time plan: no gambling, no alcohol-focused events, nothing adult-only. Write your findings as a plain list: title, venue or author, exact local start time (date + HH:MM, Europe/Riga) when it has one, one-sentence description, and the URL of the page for that specific film, book or event (its own page with showtimes/tickets/details — never a homepage, category list or search results page).`;

const EXTRACT_SYSTEM = `You turn search notes into structured listings for Balanss, a Latvian wellbeing app.

Rules:
- Use only items that appear in the notes. Do not add anything.
- "url" must be copied exactly from the notes (or null if the notes have none for that item). Use the page of that specific item; if the notes only have a homepage or a list page for it, set null.
- "startsAt" is an ISO 8601 date-time with the Europe/Riga offset (e.g. "2026-10-04T19:30:00+03:00") for screenings and events, otherwise null. If the notes give no exact time, use null.
- "title" keeps the original title as listed in Latvia. "subtitle": director and year, author, or organiser. "venue": cinema or venue name, or null.
- "description": one short, friendly sentence in Latvian (informal "tu", no emoji, no pressure), at most 200 characters.
- "provider": cinema (screening in a cinema), go3 (available on Go3), streaming (other services), book, event, idea.`;

function searchTask(q: LeisureQuery): { task: string; allowedDomains: string[] | null } {
  const g = genreLabel(q.kind, q.genre);
  const window = `between ${q.earliest.toISOString()} and ${q.windowEnd.toISOString()} (local date today: ${q.localDate}, Europe/Riga)`;
  if (q.kind === 'movie' && q.where === 'cinema')
    return { task: `Find today's cinema screenings in ${q.city}, Latvia, genre: ${g}. Only screenings that start ${window}. Up to 6, with cinema name, start time and the URL of that film's page on the cinema's site (with showtimes/tickets), not the cinema homepage.`, allowedDomains: null };
  if (q.kind === 'movie' && q.where === 'go3')
    return { task: `Find films of genre "${g}" that are currently available on Go3 (go3.lv) in Latvia. Up to 6, each with the URL of its own go3.lv page (the film's page, not go3.lv itself or a category).`, allowedDomains: ['go3.lv'] };
  if (q.kind === 'movie')
    return { task: `Suggest up to 6 well-reviewed films of genre "${g}" that are easy to watch in Latvia now (in cinemas in ${q.city}, on Go3, or other services). Give the URL of the film's own page on the service where it is available.`, allowedDomains: null };
  if (q.kind === 'book')
    return { task: `Suggest up to 6 well-loved books of genre "${g}" that are available in Latvian (or widely read in Latvia). Give author and the URL of the book's own product page at a Latvian bookshop (e.g. Jānis Roze, Zvaigzne ABC, Globuss) or a library catalogue entry — not a shop homepage or search page.`, allowedDomains: null };
  return { task: `Find public events in or near ${q.city}, Latvia, of type "${g}", that start ${window}. Up to 6, with venue, exact start time and the URL of that event's own page (ticket page or organiser page), not the venue homepage. Skip anything already sold out or cancelled.`, allowedDomains: null };
}

/** Step 1: a web-search turn. Returns the notes and every URL the search returned. */
async function searchStage(client: ClaudeClient, model: string, log: FastifyBaseLogger, q: LeisureQuery): Promise<{ notes: string; urls: Set<string> }> {
  const { task, allowedDomains } = searchTask(q);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: task }];
  const urls = new Set<string>();
  let notes = '';
  for (let turn = 0; turn < 3; turn++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      system: [{ type: 'text', text: SEARCH_SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low' },
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 5,
          user_location: { type: 'approximate', city: q.city, country: 'LV', timezone: 'Europe/Riga' },
          ...(allowedDomains ? { allowed_domains: allowedDomains } : {}),
        },
      ],
      messages,
    });
    log.info(
      { ai: { route: 'leisure.search', model: response.model, stopReason: response.stop_reason, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } },
      'ai usage',
    );
    if (response.stop_reason === 'refusal') throw new AiCallError('refusal', 'search refused');
    for (const b of response.content) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) urls.add(r.url);
      if (b.type === 'text') {
        notes += b.text;
        for (const c of b.citations ?? []) if (c.type === 'web_search_result_location') urls.add(c.url);
      }
    }
    if (response.stop_reason !== 'pause_turn') break;
    // Server-side search loop paused: send the turn back unchanged to resume.
    messages.push({ role: 'assistant', content: response.content });
  }
  return { notes, urls };
}

export function claudeLeisureEngine(client: ClaudeClient, model: string): LeisureEngine {
  return {
    async suggest(q, log) {
      try {
        const { notes, urls } = await searchStage(client, model, log, q);
        if (!notes.trim() || urls.size === 0) return curatedResult(q, 'live_empty');
        const out = await callStructured(client, model, log, {
          route: 'leisure.extract',
          system: EXTRACT_SYSTEM,
          schema: ListingsSchema,
          effort: 'low',
          maxTokens: 8000,
          content: `<notes>${notes}</notes>\n<urls>${[...urls].join('\n')}</urls>`,
        });
        const items = validateListings(out.items, q, urls);
        if (!items.length) return curatedResult(q, 'live_empty');
        return { items, live: true, note: null };
      } catch (err) {
        logAiFailure(log, 'leisure', err);
        return curatedResult(q, 'unavailable');
      }
    },
  };
}

// ---------------------------------------------------------------- curated fallback (no live data)

const BOOKS: Record<string, [string, string][]> = {
  latvian: [
    ['Mātes piens', 'Nora Ikstena'],
    ['Paisums', 'Inga Ābele'],
    ['Mērnieku laiki', 'Reinis un Matīss Kaudzītes'],
  ],
  novel: [
    ['Simts vientulības gadi', 'Gabriels Garsija Markess'],
    ['Lepnums un aizspriedumi', 'Džeina Ostina'],
    ['Triumfa arka', 'Ēriks Marija Remarks'],
  ],
  crime: [
    ['Slepkavība Austrumu ekspresī', 'Agata Kristi'],
    ['Baskervilu suns', 'Artūrs Konans Doils'],
    ['Sniegavīrs', 'Jū Nesbē'],
  ],
  fantasy: [
    ['Hobits', 'Dž. R. R. Tolkīns'],
    ['Harijs Poters un Filozofu akmens', 'Dž. K. Roulinga'],
    ['Zemjūras burvis', 'Ursula K. Le Gvina'],
  ],
  biography: [
    ['Stīvs Džobss', 'Valters Aizeksons'],
    ['Cilvēks meklē jēgu', 'Viktors Frankls'],
  ],
  science: [
    ['Sapiens. Cilvēces īsa vēsture', 'Juvals Noass Harari'],
    ['Īsa laika vēsture', 'Stīvens Hokings'],
  ],
  poetry: [
    ['Epifānijas', 'Imants Ziedonis'],
    ['Gals un sākums', 'Rainis'],
    ['Sarkanās puķes', 'Aspazija'],
  ],
};

const MOVIES: Record<string, [string, string][]> = {
  comedy: [['Limuzīns Jāņu nakts krāsā', 'Jānis Streičs, 1981']],
  family: [['Pedingtons 2', 'Pols Kings, 2017']],
  animation: [['Straume', 'Gints Zilbalodis, 2024']],
  drama: [['Ilgais ceļš kāpās', 'Aloizs Brenčs, 1981']],
  documentary: [['Vai viegli būt jaunam?', 'Juris Podnieks, 1986']],
};

/** Curated books and timeless ideas; never timed events. `reason` picks the note. */
export function curatedResult(q: LeisureQuery, reason: 'live_empty' | 'unavailable' | 'offline'): LeisureResult {
  const items: RawListing[] = [];
  if (q.kind === 'book') {
    for (const [title, author] of BOOKS[q.genre] ?? BOOKS.novel!) {
      items.push({
        title,
        subtitle: author,
        description: 'Pajautā bibliotēkā vai grāmatnīcā — daudzas ir pieejamas arī e-grāmatā.',
        startsAt: null,
        venue: null,
        url: `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(`${title} ${author}`)}`,
        provider: 'book',
      });
    }
  } else if (q.kind === 'movie') {
    for (const [title, sub] of MOVIES[q.genre] ?? []) {
      items.push({ title, subtitle: sub, description: 'Pieejamību pārbaudi Go3 vai citā tev ērtā vietā.', startsAt: null, venue: null, url: null, provider: 'idea' });
    }
    items.push({ title: 'Filmu vakars mājās', subtitle: null, description: `Izvēlies ${genreLabel('movie', q.genre).toLowerCase()} no sava saraksta, uzaicini kādu tuvu cilvēku un uztaisi tēju.`, startsAt: null, venue: null, url: null, provider: 'idea' });
  } else {
    items.push(
      { title: 'Pastaiga pa parku vai krastmalu', subtitle: q.city, description: 'Mierīgs laiks ārā, bez plāna un bez steigas.', startsAt: null, venue: null, url: null, provider: 'idea' },
      { title: 'Bibliotēkas apmeklējums', subtitle: q.city, description: 'Bibliotēkās bieži notiek arī bezmaksas pasākumi — pajautā uz vietas.', startsAt: null, venue: null, url: null, provider: 'idea' },
    );
  }
  const note =
    q.kind === 'book'
      ? null
      : reason === 'live_empty'
        ? 'Šobrīd neatradām atbilstošus ierakstus ar laiku un saiti, tāpēc šeit ir idejas bez laika.'
        : 'Aktuālos sarakstus šobrīd neizdevās ielādēt, tāpēc šeit ir idejas bez laika.';
  return { items: validateListings(items, { ...q, kind: q.kind === 'book' ? 'book' : 'movie', where: 'any' }, null), live: false, note };
}

// ---------------------------------------------------------------- fake provider (tests, local dev)

/**
 * Deterministic listings relative to `now`, including one screening/event that starts in
 * 10 minutes and one that already started, so tests can see the filter at work.
 */
export const fakeLeisureEngine: LeisureEngine = {
  async suggest(q) {
    const at = (min: number) => new Date(q.now.getTime() + min * 60_000).toISOString();
    // A start that is inside the window whatever the time of day: 90 min after the earliest start, or halfway to the window end.
    const inWindow = (plusMin = 0) => new Date(Math.min(q.earliest.getTime() + (90 + plusMin) * 60_000, (q.earliest.getTime() + q.windowEnd.getTime()) / 2 + plusMin * 60_000)).toISOString();
    const g = genreLabel(q.kind, q.genre);
    let raw: RawListing[];
    let urls: string[];
    if (q.kind === 'movie' && q.where === 'go3') {
      raw = [
        { title: `Go3 ${g.toLowerCase()} 1`, subtitle: 'Režisors A, 2024', description: 'Viegla filma vakaram.', startsAt: null, venue: null, url: 'https://go3.lv/movies/test-1', provider: 'go3' },
        { title: `Go3 ${g.toLowerCase()} 2`, subtitle: 'Režisors B, 2023', description: 'Laba izvēle kopā ar draugiem.', startsAt: null, venue: null, url: 'https://go3.lv/movies/test-2', provider: 'go3' },
        { title: 'Nav no Go3', subtitle: null, description: 'Saite nav no go3.lv, tāpēc netiek rādīta.', startsAt: null, venue: null, url: 'https://example.com/x', provider: 'go3' },
        { title: 'Tikai sākumlapa', subtitle: null, description: 'Saite ved uz go3.lv sākumlapu, nevis filmu.', startsAt: null, venue: null, url: 'https://go3.lv/', provider: 'go3' },
      ];
      urls = ['https://go3.lv/movies/test-1', 'https://go3.lv/movies/test-2', 'https://example.com/x', 'https://go3.lv/'];
    } else if (q.kind === 'movie' && q.where === 'cinema') {
      raw = [
        { title: 'Jau sākusies filma', subtitle: null, description: 'Sākās pirms stundas.', startsAt: at(-60), venue: 'Kino A', url: 'https://kino.example.lv/filma/vakara-seanss-2026', provider: 'cinema' },
        { title: 'Pēc 10 minūtēm', subtitle: null, description: 'Par vēlu, lai paspētu.', startsAt: at(10), venue: 'Kino A', url: 'https://kino.example.lv/filma/vakara-seanss-2026', provider: 'cinema' },
        { title: `Vakara seanss: ${g}`, subtitle: 'Režisors C, 2026', description: 'Seanss vēl šovakar.', startsAt: inWindow(), venue: 'Kino A', url: 'https://kino.example.lv/filma/vakara-seanss-2026', provider: 'cinema' },
        { title: 'Izdomāta saite', subtitle: null, description: 'Saite nav no meklēšanas.', startsAt: inWindow(30), venue: 'Kino B', url: 'https://invented.example.lv/b', provider: 'cinema' },
      ];
      urls = ['https://kino.example.lv/filma/vakara-seanss-2026'];
    } else if (q.kind === 'event') {
      raw = [
        { title: 'Jau notiek', subtitle: null, description: 'Sākās pirms 2 stundām.', startsAt: at(-120), venue: 'Zāle A', url: 'https://events.example.lv/event/jau-notiek', provider: 'event' },
        { title: `${g} ${q.city}`, subtitle: 'Organizators X', description: 'Mierīgs pasākums vakarā.', startsAt: inWindow(), venue: 'Zāle B', url: 'https://events.example.lv/event/vakara-koncerts', provider: 'event' },
        { title: 'Pēc nedēļas', subtitle: null, description: 'Ārpus izvēlētā laika.', startsAt: at(8 * 24 * 60), venue: 'Zāle C', url: 'https://events.example.lv/event/pec-nedelas', provider: 'event' },
      ];
      urls = raw.map((r) => r.url!);
    } else {
      return curatedResult(q, 'offline');
    }
    const items = validateListings(raw, q, new Set(urls));
    return items.length ? { items, live: true, note: null } : curatedResult(q, 'live_empty');
  },
};
