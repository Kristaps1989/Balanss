import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiError, type EventWhen, type LeisureItem, type LeisureKind, type LeisureResponse, type MovieWhere } from '@/api';
import { keys, useMe } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipGroup, PillChoice, Segmented } from '@/components/Controls';
import { BackButton } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Loading } from '@/components/States';
import { startsWhen } from '@/lib/format';
import { useToday } from '@/lib/today';
import { colors, fonts, radius, type } from '@/theme';
import { EVENT_WHEN, LEISURE_CITIES, LEISURE_GENRES, LEISURE_KINDS, MOVIE_WHERE } from '@shared/leisure';

const PROVIDER_LABEL: Record<LeisureItem['provider'], string> = {
  cinema: 'Kinoteātrī',
  go3: 'Go3',
  streaming: 'Straumēšanā',
  book: 'Grāmata',
  event: 'Pasākums',
  idea: 'Ideja',
};

/**
 * Brīvais laiks: a film (cinema / Go3 / anywhere), a book or an event in the user's city.
 * Live listings come from a web search done on our server; only items that still start in
 * 30+ minutes and have a real link are shown.
 */
export default function Leisure() {
  const today = useToday();
  const qc = useQueryClient();
  const me = useMe();
  const [editCity, setEditCity] = useState(false);
  const [kind, setKind] = useState<LeisureKind>('movie');
  const [genre, setGenre] = useState<string | null>(null);
  const [where, setWhere] = useState<MovieWhere>('cinema');
  const [when, setWhen] = useState<EventWhen>('today');
  const city = me.data?.leisureCity ?? null;

  const saveCity = useMutation({
    mutationFn: (c: string) => api.setCity(c),
    onSuccess: (m) => {
      qc.setQueryData(keys.me, m);
      setEditCity(false);
      search.reset();
    },
  });
  const search = useMutation({
    mutationFn: () => api.suggestLeisure({ kind, genre: genre!, ...(kind === 'movie' ? { where } : {}), ...(kind === 'event' ? { when } : {}) }),
  });
  const change = (fn: () => void) => {
    fn();
    search.reset();
  };

  return (
    <Screen testID="leisure">
      <View style={{ marginLeft: -10 }}>
        <BackButton />
      </View>
      <View style={{ gap: 4 }}>
        <Text style={type.h1} accessibilityRole="header">
          Brīvais laiks
        </Text>
        <Text style={type.secondary}>Filma, grāmata vai pasākums — no tā, kas notiek tavā pilsētā tieši tagad.</Text>
      </View>

      {!city || editCity ? (
        <View style={{ gap: 10 }}>
          <Text style={type.section}>Kurā pilsētā?</Text>
          <Text style={type.caption}>Atrašanās vietu neizmantojam — tikai pilsētu, ko izvēlies.</Text>
          <ChipGroup label="Pilsēta" options={LEISURE_CITIES.map((c) => ({ value: c, label: c }))} value={city as (typeof LEISURE_CITIES)[number] | null} onChange={(c) => saveCity.mutate(c)} />
        </View>
      ) : (
        <View style={styles.cityRow}>
          <Text style={type.secondary}>
            Pilsēta: <Text style={{ fontFamily: fonts.bodySemi, color: colors.ink }}>{city}</Text>
          </Text>
          <Pressable onPress={() => setEditCity(true)} accessibilityRole="button" hitSlop={12}>
            <Text style={type.link}>Mainīt</Text>
          </Pressable>
        </View>
      )}

      {city && !editCity && (
        <>
          <Segmented options={LEISURE_KINDS.map((k) => ({ value: k.key, label: k.label }))} value={kind} onChange={(k) => change(() => (setKind(k), setGenre(null)))} />

          <View style={{ gap: 10 }}>
            <Text style={type.section}>{kind === 'movie' ? 'Kāda filma?' : kind === 'book' ? 'Kāda grāmata?' : 'Kāds pasākums?'}</Text>
            <ChipGroup label="Žanrs" options={LEISURE_GENRES[kind].map((g) => ({ value: g.key, label: g.label }))} value={genre} onChange={(g) => change(() => setGenre(g))} />
          </View>

          {kind === 'movie' && (
            <View style={{ gap: 10 }}>
              <Text style={type.section}>Kur skatīties?</Text>
              <PillChoice options={MOVIE_WHERE.map((w) => ({ value: w.key, label: w.label }))} value={where} onChange={(w) => change(() => setWhere(w))} />
            </View>
          )}
          {kind === 'event' && (
            <View style={{ gap: 10 }}>
              <Text style={type.section}>Kad?</Text>
              <PillChoice options={EVENT_WHEN.map((w) => ({ value: w.key, label: w.label }))} value={when} onChange={(w) => change(() => setWhen(w))} />
            </View>
          )}

          <Button label="Meklēt idejas" icon="sparkle" onPress={() => search.mutate()} disabled={!genre || search.isPending} testID="leisure-search" />

          {search.isPending && <Loading label="Meklēju, kas notiek tagad… tas var aizņemt līdz pusminūtei." />}
          {search.isError && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {search.error instanceof ApiError && search.error.status === 429
                ? 'Šodien meklēšanas limits ir sasniegts. Pamēģini rīt.'
                : 'Neizdevās ielādēt idejas. Mēģini vēlreiz.'}
            </Text>
          )}
          {search.data && <Results data={search.data} today={today} />}
        </>
      )}
    </Screen>
  );
}

/** What the link opens, so the user knows before tapping. */
function linkLabel(i: LeisureItem, live: boolean): string {
  if (i.provider === 'go3') return 'Atvērt Go3';
  if (i.provider === 'cinema') return 'Seansi un biļetes';
  if (i.provider === 'event') return 'Pasākums un biļetes';
  if (i.provider === 'book') return live ? 'Atvērt grāmatu' : 'Meklēt grāmatu';
  return 'Atvērt';
}
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

function Results({ data, today }: { data: LeisureResponse; today: string }) {
  return (
    <View style={{ gap: 12 }} testID="leisure-results">
      {data.note && <Text style={type.secondary}>{data.note}</Text>}
      {data.items.length === 0 && !data.note && <Text style={type.secondary}>Šobrīd neko piemērotu neatradām. Pamēģini citu žanru vai laiku.</Text>}
      {data.items.map((i) => (
        <Card key={i.id} style={styles.item} testID="leisure-item">
          <Text style={styles.kicker}>
            {PROVIDER_LABEL[i.provider]}
            {i.startsAt ? ` · ${startsWhen(i.startsAt, today)}` : ''}
          </Text>
          <Text style={type.bodySemi}>{i.title}</Text>
          {(i.subtitle || i.venue) && <Text style={type.caption}>{[i.subtitle, i.venue].filter(Boolean).join(' · ')}</Text>}
          <Text style={type.secondary}>{i.description}</Text>
          {i.url && (
            <Pressable onPress={() => Linking.openURL(i.url!)} accessibilityRole="link" style={styles.open} hitSlop={8}>
              <Text style={type.link}>{linkLabel(i, data.live)}</Text>
              <Text style={type.caption}>{hostOf(i.url!)}</Text>
              <Icon name="arrowRight" color={colors.accentText} size={16} />
            </Pressable>
          )}
        </Card>
      ))}
      {data.items.length > 0 && (
        <Text style={type.caption}>
          {data.live ? 'Atrasts tīmeklī pirms brīža. Saite ved tieši uz filmu, grāmatu vai pasākumu; laikus un biļetes pārbaudi tur.' : 'Balanss idejas bez konkrēta laika.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  item: { gap: 6, borderRadius: radius.card },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.accentText },
  open: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentDeep },
});
