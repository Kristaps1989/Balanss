import { StyleSheet, Text, View } from 'react-native';

import { api } from '@/api';
import { useMe, useMeMutation } from '@/api/hooks';
import { Card } from '@/components/Card';
import { Toggle } from '@/components/Controls';
import { BackButton } from '@/components/Header';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Loading } from '@/components/States';
import { colors, fonts, type } from '@/theme';

const SECTIONS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'trend',
    title: 'Ko AI dara',
    body: 'Analizē tavas pēdējās nedēļas skaitļus (uzturs, ūdens, soļi, miegs), atrod paradumus un uzraksta ieteikumu, nedēļas jautājumu un kopsavilkumu tavā tonī. Paradumus aprēķinām paši — AI tos tikai noformulē.',
  },
  {
    icon: 'lock',
    title: 'Ko AI nesaņem',
    body: 'Tavu vārdu, e-pastu, personības testa atbildes un rezultātus. AI saņem tikai skaitļus, izvēlēto toni un to, kuri ieteikumi tev derēja. Dati netiek izmantoti AI modeļu apmācībai.',
  },
  {
    icon: 'heart',
    title: 'Drošības noteikumi',
    body: 'Nekādu diagnožu, zāļu vai uztura bagātinātāju, svara solījumu, vainas vai kauna, maltīšu izlaišanas vai "atstrādāšanas" ar sportu. Katru tekstu pirms parādīšanas pārbaudām; ja tas neatbilst, rādām pārbaudītu tekstu. Ja dati liecina, ka ēdiens vai atpūta pietrūkst, ieteikumi par mazāk ēšanu tiek izslēgti.',
  },
  {
    icon: 'check',
    title: 'Tu izlem',
    body: 'Ieteikumi ir neobligāti. Vari prasīt citu, ziņot par nepiemērotu vai izslēgt AI personalizāciju pavisam — tad ieteikumi būs no iepriekš pārbaudītiem tekstiem un tavi dati AI netiks sūtīti.',
  },
  {
    icon: 'camera',
    title: 'Foto un teksts',
    body: 'Kad pats nofotografē vai uzraksti maltīti, attēlu vai tekstu nosūtām AI, lai atpazītu produktus. Foto glabājam 30 dienas ES serverī, tad izdzēšam.',
  },
];

/** Kā darbojas AI — transparency, privacy and the on/off switch. */
export default function AiInfo() {
  const me = useMe();
  const set = useMeMutation(api.setAiPersonalization);
  if (!me.data) return <Loading />;
  return (
    <Screen testID="ai-info">
      <View style={{ marginLeft: -10 }}>
        <BackButton />
      </View>
      <Text style={styles.h1} accessibilityRole="header">
        Kā darbojas AI
      </Text>
      <Card style={styles.toggleCard}>
        <View style={{ flex: 1 }}>
          <Text style={type.bodySemi}>AI personalizācija</Text>
          <Text style={type.secondary}>{me.data.aiPersonalization ? 'Ieslēgta — AI analizē tavus datus.' : 'Izslēgta — ieteikumi no pārbaudītiem tekstiem.'}</Text>
        </View>
        <Toggle value={me.data.aiPersonalization} onChange={(v) => set.mutate(v)} label="AI personalizācija" testID="ai-toggle" />
      </Card>
      {SECTIONS.map((s) => (
        <View key={s.title} style={styles.section}>
          <Icon name={s.icon} color={colors.accentText} size={22} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={type.section}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        </View>
      ))}
      <Text style={type.caption}>Balanss nav medicīniska ierīce. Ja tev ir veselības stāvoklis, mērķus un uzturu pārrunā ar ārstu.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.ink },
  toggleCard: { padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  section: { flexDirection: 'row', gap: 14, paddingHorizontal: 4 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
});
