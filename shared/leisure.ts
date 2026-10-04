import type { EventWhen, LeisureKind, MovieWhere } from './api';

/** Cities offered for free-time suggestions (the user picks one; no GPS). */
export const LEISURE_CITIES = [
  'Rīga',
  'Jūrmala',
  'Daugavpils',
  'Liepāja',
  'Jelgava',
  'Ventspils',
  'Rēzekne',
  'Valmiera',
  'Jēkabpils',
  'Ogre',
  'Cēsis',
  'Sigulda',
  'Tukums',
  'Kuldīga',
  'Talsi',
  'Smiltene',
] as const;

export const LEISURE_KINDS: { key: LeisureKind; label: string }[] = [
  { key: 'movie', label: 'Filma' },
  { key: 'book', label: 'Grāmata' },
  { key: 'event', label: 'Pasākums' },
];

/** Genre keys → Latvian labels, per kind. */
export const LEISURE_GENRES: Record<LeisureKind, { key: string; label: string }[]> = {
  movie: [
    { key: 'comedy', label: 'Komēdija' },
    { key: 'drama', label: 'Drāma' },
    { key: 'thriller', label: 'Trilleris' },
    { key: 'scifi', label: 'Fantastika' },
    { key: 'animation', label: 'Animācija' },
    { key: 'documentary', label: 'Dokumentālā' },
    { key: 'romance', label: 'Romantika' },
    { key: 'family', label: 'Ģimenei' },
  ],
  book: [
    { key: 'novel', label: 'Romāns' },
    { key: 'crime', label: 'Detektīvs' },
    { key: 'fantasy', label: 'Fantāzija' },
    { key: 'biography', label: 'Biogrāfija' },
    { key: 'science', label: 'Populārzinātne' },
    { key: 'latvian', label: 'Latviešu autori' },
    { key: 'poetry', label: 'Dzeja' },
  ],
  event: [
    { key: 'concert', label: 'Koncerts' },
    { key: 'theatre', label: 'Teātris' },
    { key: 'exhibition', label: 'Izstāde' },
    { key: 'outdoors', label: 'Ārā, dabā' },
    { key: 'sport', label: 'Sports' },
    { key: 'family', label: 'Ģimenei' },
    { key: 'talk', label: 'Lekcija' },
  ],
};

export const MOVIE_WHERE: { key: MovieWhere; label: string }[] = [
  { key: 'cinema', label: 'Kinoteātrī' },
  { key: 'go3', label: 'Go3' },
  { key: 'any', label: 'Jebkur' },
];

export const EVENT_WHEN: { key: EventWhen; label: string }[] = [
  { key: 'today', label: 'Šodien' },
  { key: 'weekend', label: 'Nedēļas nogalē' },
];

export const genreLabel = (kind: LeisureKind, key: string) => LEISURE_GENRES[kind].find((g) => g.key === key)?.label ?? key;

/** Daily per-user limit for live searches (each one costs a web search). */
export const LEISURE_DAILY_LIMIT = 15;
