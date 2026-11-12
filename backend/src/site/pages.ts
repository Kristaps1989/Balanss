import { ANDROID_RELEASE as APK } from './download';
import { table } from './layout';
import { OWNER, POLICY_DATE, ownerLine } from './owner';

/**
 * Public website pages (Latvian). The privacy policy describes what the code does; when data
 * handling changes (new provider, new data type, retention), update /privatums in the same PR.
 * Facts behind each section: backend/src/db/schema.ts, backend/src/ai/*, backend/src/services/gdpr.ts,
 * backend/src/services/photos.ts, src/lib/health/*, .railway/railway.ts.
 */
export type Page = { path: string; title: string; description: string; body: () => string };

const mail = `<a href="mailto:${OWNER.email}">${OWNER.email}</a>`;
const owner = ownerLine;

/** The Šodiena screen, drawn in HTML so the hero shows the product itself (sample day from CLAUDE.md). */
function phone(): string {
  const c = 2 * Math.PI * 92;
  return `<div class="phone" role="img" aria-label="ZestWell ekrāns Šodiena: 270 kcal vēl šodien, olbaltumvielas 68 no 110 g, ūdens 1,2 l, 6 430 soļi, miegs 6 h 40 min">
<div class="screen" aria-hidden="true">
  <div class="p-status"><span>9:41</span><span>100%</span></div>
  <div class="p-head"><div><div class="p-date">trešdiena, 11. novembris</div><div class="p-hello">Labrīt, Ilze</div></div><div class="p-avatar">I</div></div>
  <div class="p-ring">
    <svg width="196" height="196" viewBox="0 0 196 196"><circle cx="98" cy="98" r="92" fill="none" stroke="#1E2A23" stroke-width="6"/><circle cx="98" cy="98" r="92" fill="none" stroke="#6CCB94" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * 0.846).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 98 98)"/></svg>
    <div><b>270</b><span>kcal vēl šodien</span></div>
  </div>
  <div class="p-macros">
    <div><span>Olbaltumv.</span><b>68 / 110 g</b><i style="--v:62%;--c:#F29468"></i></div>
    <div><span>Ogļhidrāti</span><b>160 / 190 g</b><i style="--v:84%;--c:#EDC060"></i></div>
    <div><span>Tauki</span><b>52 / 60 g</b><i style="--v:87%;--c:#C29BDB"></i></div>
  </div>
  <div class="p-focus"><b>Šodienas fokuss</b><p>68 g olbaltumvielu jau ir, vēl 42 g. Biezpiens vakariņās dod +18 g.</p><span>Labi, pamēģināšu</span></div>
  <div class="p-tiles">
    <div><span>Ūdens</span><b>1,2 l</b></div>
    <div><span>Soļi</span><b>6 430</b></div>
    <div><span>Miegs</span><b>6 h 40</b></div>
  </div>
  <div class="p-tabs"><span class="on">Šodiena</span><span>Uzturs</span><span class="plus">+</span><span>Kustība</span><span>Miegs</span></div>
</div></div>`;
}

/** Steps per hour from 06:00; the day is read at 13:10, so the hours up to 22:00 are still empty. */
const STEP_HOURS = [8, 34, 62, 28, 22, 46, 88, 52];

function home(): string {
  const cols = Array.from({ length: 17 }, (_, i) => (i < STEP_HOURS.length ? `<i style="--h:${STEP_HOURS[i]}%"></i>` : `<i class="rest" style="--h:4%"></i>`)).join('');
  return `
<section class="hero"><div class="wrap">
  <div class="hero-copy">
    <h1>Tava diena vienā skatā.</h1>
    <p class="lead">Uzturs, kustība, pulss un miegs vienuviet. Nofotografē maltīti, pārējais ienāk no pulksteņa, un padomi skan tavā tonī.</p>
    <a class="btn" href="${APK.url}" download>Lejupielādēt Android lietotni</a>
    <p class="meta">Testa versija ${APK.version}, ${APK.sizeMb} MB, Android ${APK.minAndroid} vai jaunāka. Drīzumā Google Play, vēlāk arī App Store.</p>
  </div>
  ${phone()}
</div></section>

<section class="moment m-morning"><div class="wrap">
  <div class="time">07:40<span>Rīts</span></div>
  <div>
    <h2>Nofotografē brokastis.</h2>
    <p>Viens foto, un ZestWell aptuveni novērtē kalorijas, olbaltumvielas, ogļhidrātus, taukus, šķiedrvielas un kalciju. Ja kaut kas nav precīzi, izlabo un saglabā.</p>
  </div>
  <div class="ui">
    <div class="plate"><svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r="70" fill="#EFE9DC"/><circle cx="75" cy="75" r="58" fill="#D9BB8C"/><circle cx="62" cy="64" r="25" fill="#FAF7EF"/><g fill="#3B4A86"><circle cx="96" cy="58" r="7"/><circle cx="104" cy="74" r="7"/><circle cx="90" cy="76" r="7"/><circle cx="98" cy="92" r="7"/><circle cx="52" cy="100" r="7"/></g><path d="M70 104q10-12 22 0q-12 8-22 0z" fill="#6CCB94"/></svg></div>
    <small>Brokastis, 07:40</small>
    <div class="big">420<em>kcal</em></div>
    <ul class="rows">
      <li><span style="--c:#D16B3A">Olbaltumvielas</span><b>18 g</b></li>
      <li><span style="--c:#B07A12">Ogļhidrāti</span><b>58 g</b></li>
      <li><span style="--c:#8E6BA8">Tauki</span><b>11 g</b></li>
      <li><span style="--c:#5F8B3A">Šķiedrvielas</span><b>7 g</b></li>
      <li><span style="--c:#4E73C7">Kalcijs, aptuveni</span><b>210 mg</b></li>
    </ul>
  </div>
</div></section>

<section class="moment m-day"><div class="wrap">
  <div class="time">13:10<span>Diena</span></div>
  <div>
    <h2>Pulkstenis jau zina pārējo.</h2>
    <p>Soļi, pulss, treniņi un miegs ienāk no Health Connect. Mēs tos tikai lasām un nekad neko nemainām.</p>
  </div>
  <div class="ui">
    <small>Soļi šodien</small>
    <div class="big">6 430<em>no 8 000</em></div>
    <div class="cols">${cols}</div>
    <div class="axis"><span>06</span><span>10</span><span>14</span><span>18</span><span>22</span></div>
    <div class="pair"><div><small>Pulss miera stāvoklī</small><b>61</b></div><div><small>HRV</small><b>42 ms</b></div></div>
    <small style="margin-top:18px">Dati no Health Connect</small>
  </div>
</div></section>

<section class="moment m-evening"><div class="wrap">
  <div class="time">18:30<span>Vakars</span></div>
  <div>
    <h2>Tie paši dati. Tavs tonis.</h2>
    <p>Īss personības tests sākumā, 20 apgalvojumi, nosaka, kā ZestWell ar tevi runā: ar plānu un skaitļiem, ar kaut ko jaunu vai maigi un bez spiediena.</p>
    <p class="note">Šis nav klīnisks vai diagnostisks tests. Toni vari mainīt un profilu dzēst jebkurā brīdī.</p>
  </div>
  <div class="tones">
    <div class="tone on"><b>Plāns un skaitļi</b><p>68 g olbaltumvielu jau ir, vēl 42 g. Plāns: biezpiens vakariņās (+18 g), vista rīt pusdienās (+30 g).</p></div>
    <div class="tone"><b>Dažādība un jaunais</b><p>Ideja šodienai: lēcu zupa ar ciedru riekstiem. Tā papildinās šķiedrvielas, un būs kaut kas jauns.</p></div>
    <div class="tone"><b>Maigi, bez spiediena</b><p>Miegs bija īsāks, tas ir normāli. Šodien bez spiediena. Ja sanāk, 15 minūšu pastaiga.</p></div>
  </div>
</div></section>

<section class="moment m-night"><div class="wrap">
  <div class="time">23:00<span>Nakts</span></div>
  <div>
    <h2>Laiks gulēt, kad tas der tev.</h2>
    <p>Vakarā ZestWell atgādina par tavu miega logu. No rīta redzi, cik gulēji un kā dalījās dziļais, REM un vieglais miegs.</p>
  </div>
  <div class="ui">
    <small>Pagājušajā naktī</small>
    <div class="big">6 h 40<em>min</em></div>
    <div class="stages"><i style="flex:65;background:#7486D6"></i><i style="flex:80;background:#9AA9EC"></i><i style="flex:255;background:#C9D1F5"></i></div>
    <div class="legend"><span style="--c:#7486D6">Dziļais 1 h 05</span><span style="--c:#9AA9EC">REM 1 h 20</span><span style="--c:#C9D1F5">Vieglais 4 h 15</span></div>
    <div class="window"><small>Miega logs šovakar</small><b>23:00–23:30</b></div>
  </div>
</div></section>

<section class="promise"><div class="wrap">
  <h2>Ieradumi, nevis diētas.</h2>
  <p class="said">“68 g jau ir, vēl 42 g.”</p>
  <p class="blurb">Tā ZestWell runā par tavu dienu: vispirms tas, kas jau izdarīts. Nekādas sarkanās krāsas par pārsniegtu mērķi.</p>
  <div class="trust">
    <div><h3>Tavi dati paliek ES</h3><p>Datubāze, foto un serveris atrodas Eiropas Savienībā.</p></div>
    <div><h3>Bez reklāmām un izsekošanas</h3><p>Lietotnē nav reklāmu un analītikas rīku. Datus nepārdodam.</p></div>
    <div><h3>Eksportē vai dzēs jebkurā brīdī</h3><p>Visus savus datus vari saņemt failā vai dzēst no lietotnes.</p></div>
  </div>
</div></section>

<section class="install" id="instalet"><div class="wrap">
  <div>
    <h2>Izmēģini testa versiju.</h2>
    <a class="btn dark" href="${APK.url}" download>Lejupielādēt Android lietotni</a>
    <p class="meta">Versija ${APK.version}, ${APK.sizeMb} MB, Android ${APK.minAndroid} vai jaunāka. Jautājumi? Raksti ${mail}.</p>
  </div>
  <div>
    <ol class="steps">
      <li><span>Atver šo lapu Android telefonā un pieskaries <b>Lejupielādēt Android lietotni</b>.</span></li>
      <li><span>Atver lejupielādēto failu <b>zestwell.apk</b>. Ja telefons jautā, atļauj pārlūkam instalēt nezināmas lietotnes.</span></li>
      <li><span>Pieskaries <b>Instalēt</b>, atver ZestWell un pieslēdzies ar <span class="nb">e-pastu</span>.</span></li>
    </ol>
    <p class="sha">Ja telefonā jau ir agrāka ZestWell vai Balanss testa versija un instalēšana neizdodas, vispirms to atinstalē. Faila SHA-256: <code>${APK.sha256}</code></p>
  </div>
</div></section>`;
}

function privacy(): string {
  return `
<article>
<h1>Privātuma politika</h1>
<p class="muted">Spēkā no ${POLICY_DATE}.</p>
<p>Šī politika skaidro, kādus datus apstrādā lietotne ZestWell un vietne zestwell.app, kāpēc, cik ilgi un kādas ir tavas tiesības. Daļa datu (veselības dati un personības testa rezultāti) ir īpašu kategoriju dati saskaņā ar Vispārīgo datu aizsardzības regulu (VDAR), tāpēc tos apstrādājam tikai ar tavu skaidru piekrišanu un tikai tik, cik vajag lietotnes darbībai.</p>

<h2>1. Pārzinis</h2>
<p>${owner()}. E-pasts privātuma jautājumiem: ${mail}.</p>

<h2>2. Kādus datus apstrādājam</h2>
${table(
  ['Dati', 'No kurienes', 'Kam'],
  [
    [`<b>Konts:</b> e-pasta adrese; Google vai Apple konta identifikators; vārds, ja to nodod Google vai Apple.`, `Tu, pieslēdzoties`, `Pieslēgšanās, konta pārvaldība`],
    [`<b>Profils:</b> vecums, dzimums, augums, svars, aktivitātes līmenis, mērķi, vēlamais svars, ēšanas paradumi (piemēram, veģetārs, no kā izvairies, īss apraksts par paradumiem).`, `Tu`, `Dienas mērķu aprēķins, piemēroti ieteikumi`],
    [`<b>Uzturs:</b> maltītes, produkti, porcijas, uzturvērtības, ūdens, svars, izlase, produkti ledusskapī. Maltīšu foto.`, `Tu`, `Dienas pārskats, foto analīze`],
    [`<b>Veselības dati no Health Connect</b> (tikai lasīšana): soļi, aktīvās kalorijas, pulss miera stāvoklī, sirdsdarbības mainība (HRV), miegs un tā fāzes, treniņi (veids, ilgums, vidējais pulss, pulsa zonas), svars, ierīču nosaukumi.`, `Health Connect tavā telefonā, ar tavu atļauju`, `Kustības un miega pārskats`],
    [`<b>Personības tests:</b> 20 atbildes, piecu īpašību līmeņi un no tiem izvēlētais komunikācijas tonis.`, `Tu, ja izvēlies pildīt testu`, `Padomu un atgādinājumu tonis`],
    [`<b>Ieteikumi un atgriezeniskā saite:</b> padomi, nedēļas jautājumi un tavas atbildes, pieņemtie, noraidītie un ziņotie padomi, nedēļas kopsavilkumi, receptes.`, `Lietotne, tu`, `Personalizēti, neatkārtojoši ieteikumi`],
    [`<b>Iestatījumi:</b> atgādinājumi, tonis, AI personalizācija, laika josla, pilsēta brīvā laika idejām.`, `Tu`, `Lietotnes darbība`],
    [`<b>Tehniskie dati:</b> paziņojumu (push) marķieris un platforma, pieslēgšanās marķieri (glabāti jaukti), pēdējās aktivitātes laiks, abonementa plāns un tā beigu datums.`, `Telefons, lietotne, veikals`, `Paziņojumi, drošība, Pro funkcijas`],
  ],
)}
<p>Lietotnē nav reklāmu, analītikas vai kļūdu izsekošanas rīku. Mēs nepārdodam datus un neizmantojam tos reklāmai. Vietne zestwell.app neizmanto sīkdatnes un neielādē trešo pušu resursus. Android testa versijas fails tiek glabāts GitHub (ASV); to lejupielādējot, GitHub apstrādā tavu IP adresi saskaņā ar savu privātuma politiku.</p>

<h2>3. Tiesiskais pamats</h2>
<ul>
<li><b>Līguma izpilde</b> (VDAR 6. panta 1. punkta b) apakšpunkts): konts, profils, uztura dati, iestatījumi, abonements.</li>
<li><b>Skaidra piekrišana</b> (VDAR 9. panta 2. punkta a) apakšpunkts): veselības dati no Health Connect un personības testa rezultāti. Health Connect atļaujas dod un atsauc telefona iestatījumos, personības profilu vari dzēst lietotnē. Piekrišanas atsaukšana neietekmē iepriekšējās apstrādes likumību.</li>
<li><b>Leģitīmās intereses</b> (VDAR 6. panta 1. punkta f) apakšpunkts): drošība, ļaunprātīgas izmantošanas novēršana, tehniskie žurnāli.</li>
<li><b>Juridisks pienākums</b>: ja normatīvie akti prasa glabāt vai izpaust noteiktu informāciju.</li>
</ul>

<h2>4. Mākslīgais intelekts</h2>
<p>Maltīšu foto atpazīšanai, teksta ievades apstrādei un personalizētiem ieteikumiem izmantojam Anthropic Claude modeļus. Mūsu serveris nosūta tikai to, kas vajadzīgs konkrētajam uzdevumam:</p>
<ul>
<li><b>Foto analīze</b>: maltītes vai ledusskapja foto, vai tevis ierakstītais apraksts.</li>
<li><b>Padomi, jautājumi, kopsavilkumi, receptes</b>: dienas skaitļi pret mērķiem (uzturs, soļi, miegs), dzimums, izvēlētais tonis, ēšanas paradumi un iepriekšējo padomu vērtējumi.</li>
<li><b>Brīvā laika idejas</b>: tava izvēlētā pilsēta un meklējuma veids. Meklēšanu tīmeklī veic Anthropic.</li>
</ul>
<p>Mēs <b>nekad nesūtām</b> tavu vārdu, e-pastu vai personības testa atbildes un rezultātus. Tiek nosūtīts tikai no tiem izvēlētais tonis (piemēram, “maigi, bez spiediena”). Saskaņā ar Anthropic komerciālajiem noteikumiem API dati netiek izmantoti modeļu apmācībai.</p>
<p>Lietotnē (Es → AI un privātums) vari izslēgt <b>AI personalizāciju</b>. Tad padomi, jautājumi un atgādinājumi tiek veidoti no gataviem šabloniem mūsu serverī. Foto analīze un brīvā laika meklēšana joprojām izmanto AI, jo bez tā šīs funkcijas nedarbojas; vari tās vienkārši neizmantot.</p>
<p>AI rezultāti ir aptuveni (piemēram, kalcijs vienmēr ir novērtējums) un var būt kļūdaini. Pārbaudi tos un labo, ja vajag.</p>

<h2>5. Kur glabājam datus</h2>
<p>Datubāze, maltīšu foto un serveris atrodas Railway mākoņpakalpojumā Eiropas Savienībā (Amsterdama, Nīderlande).</p>

<h2>6. Apstrādātāji un saņēmēji</h2>
${table(
  ['Pakalpojums', 'Ko saņem', 'Atrašanās vieta'],
  [
    [`Railway (hostings)`, `Visus lietotnes datus (glabāšana)`, `ES (Nīderlande)`],
    [`Anthropic (AI)`, `Skatīt 4. sadaļu`, `ASV`],
    [`Resend (e-pasts)`, `E-pasta adresi un pieslēgšanās saiti`, `ASV`],
    [`Expo, Google Firebase Cloud Messaging, Apple Push Notification service`, `Paziņojuma marķieri, virsrakstu un tekstu (tas var saturēt dienas skaitļus, piemēram, “Ūdens: 1,2 no 2,3 l”)`, `ASV`],
    [`RevenueCat; Google Play, Apple App Store`, `Lietotāja identifikatoru (bez e-pasta) un abonementa statusu. Maksājumus apstrādā veikals`, `ASV`],
    [`Google, Apple (pieslēgšanās)`, `Pieslēgšanās pieprasījumu, ja izvēlies šo veidu`, `ASV`],
    [`Open Food Facts`, `Tikai svītrkoda numuru, bez tevis identificējošiem datiem`, `Francija`],
  ],
)}
<p>Datu nodošanai ārpus Eiropas Ekonomikas zonas izmantojam VDAR paredzētos aizsardzības mehānismus, piemēram, Eiropas Komisijas standarta līguma klauzulas vai ES–ASV Datu privātuma regulējumu, ja pakalpojuma sniedzējs tam ir pievienojies.</p>

<h2>7. Cik ilgi glabājam</h2>
<ul>
<li><b>Maltīšu foto</b>: 30 dienas, pēc tam tie tiek dzēsti automātiski. Maltītes uzturvērtības paliek.</li>
<li><b>Ledusskapja foto</b>: netiek glabāti. Saglabājam tikai atpazītos produktu nosaukumus.</li>
<li><b>Konta un pārējie dati</b>: kamēr tev ir konts. Dzēšot kontu, tie tiek dzēsti nekavējoties.</li>
<li><b>Pieslēgšanās saite</b>: derīga 15 minūtes, izmantojama vienu reizi. <b>Datu eksporta saite</b>: 24 stundas.</li>
<li><b>Tehniskie žurnāli</b> nesatur e-pastu, marķierus vai veselības datus, un tos glabā hostinga pakalpojums ierobežotu laiku.</li>
</ul>
<p>Ja trīs dienas neatver lietotni, atgādinājumi apstājas, līdz atkal to atvērsi.</p>

<h2>8. Tavas tiesības</h2>
<p>Tev ir tiesības piekļūt saviem datiem, labot tos, dzēst tos, ierobežot to apstrādi, iebilst pret to, saņemt tos pārnesamā formātā un atsaukt piekrišanu. Lielāko daļu vari izdarīt pats lietotnē (Es → Privātums un dati):</p>
<ul>
<li><b>Eksportēt manus datus</b>: visi tavi dati JSON failā.</li>
<li><b>Dzēst personības profilu</b>: tonis kļūst neitrāls.</li>
<li><b>Dzēst visus datus un kontu</b>: skatīt <a href="/dzest-kontu">Konta dzēšana</a>.</li>
</ul>
<p>Vari arī rakstīt uz ${mail}. Atbildēsim viena mēneša laikā. Ja tavi dati nonākuši pie kāda apstrādātāja (piemēram, abonementa ieraksts RevenueCat), pēc tava pieprasījuma lūgsim tos dzēst arī tur.</p>
<p>Tev ir tiesības iesniegt sūdzību Datu valsts inspekcijā (<a href="https://www.dvi.gov.lv">www.dvi.gov.lv</a>) vai savas valsts uzraudzības iestādē.</p>

<h2>9. Bērni</h2>
<p>ZestWell ir paredzēts personām no 16 gadu vecuma. Svara samazināšanas mērķi nav pieejami personām līdz 18 gadiem.</p>

<h2>10. Drošība</h2>
<p>Savienojumi ir šifrēti (HTTPS). Pieslēgšanās marķierus glabājam jauktā veidā, foto pieejami tikai ar īslaicīgu parakstītu saiti, un piekļuve serveriem ir ierobežota.</p>

<h2>11. Izmaiņas</h2>
<p>Ja šī politika būtiski mainīsies, paziņosim lietotnē pirms izmaiņu stāšanās spēkā. Spēkā esošā versija vienmēr ir šajā lapā.</p>
</article>`;
}

function terms(): string {
  return `
<article>
<h1>Lietošanas noteikumi</h1>
<p class="muted">Spēkā no ${POLICY_DATE}.</p>
<p>Šie noteikumi ir vienošanās starp tevi un ${owner()} (“mēs”) par lietotnes ZestWell lietošanu. Lietojot lietotni, tu piekrīti šiem noteikumiem un <a href="/privatums">privātuma politikai</a>.</p>

<h2>1. Kas ir ZestWell</h2>
<p>ZestWell ir ikdienas ieradumu pavadonis: uztura reģistrēšana, kustības un miega pārskats un padomi tev piemērotā tonī.</p>
<p><b>ZestWell nav medicīniska ierīce un nesniedz medicīniskus padomus, diagnozes vai ārstēšanu.</b> Mērķi un ieteikumi ir vispārīgi un paredzēti veseliem pieaugušajiem. Uzturvērtības un AI novērtējumi ir aptuveni un var būt kļūdaini. Ja tev ir veselības stāvoklis, esi grūtniece, baro bērnu ar krūti vai tev ir bijuši ēšanas traucējumi, pirms mērķu maiņas konsultējies ar ārstu. Personības tests nav klīnisks vai diagnostisks tests.</p>

<h2>2. Konts</h2>
<ul>
<li>Lietotni drīkst lietot personas no 16 gadu vecuma.</li>
<li>Viens konts ir paredzēts vienai personai. Rūpējies par piekļuvi savam e-pastam un Google vai Apple kontam.</li>
<li>Kontu vari dzēst jebkurā brīdī: skatīt <a href="/dzest-kontu">Konta dzēšana</a>.</li>
</ul>

<h2>3. Bezmaksas versija un ZestWell Pro</h2>
<ul>
<li>Bezmaksas versijā ir līdz 3 foto analīzēm dienā, datu sinhronizācija no ierīcēm un padomi tavā stilā.</li>
<li>ZestWell Pro dod neierobežotu foto analīzi, nedēļas AI kopsavilkumu un receptes. Pro ir ikmēneša vai ikgadējs abonements, ko pērk Google Play vai App Store. Aktuālā cena redzama lietotnē un veikalā pirms pirkuma.</li>
<li>Abonements atjaunojas automātiski, līdz to atcel. Atcelt var jebkurā brīdī veikala abonementu iestatījumos. Pro paliek aktīvs līdz apmaksātā perioda beigām.</li>
<li>Maksājumus un atmaksas apstrādā Google Play vai App Store saskaņā ar to noteikumiem. Tas neierobežo tavas patērētāja tiesības saskaņā ar normatīvajiem aktiem.</li>
<li>Konta dzēšana pati par sevi neatceļ abonementu veikalā. Atcel to arī veikalā.</li>
</ul>

<h2>4. Pieņemama lietošana</h2>
<p>Lietotni nedrīkst izmantot nelikumīgiem mērķiem, mēģināt piekļūt citu lietotāju datiem, traucēt servisa darbību, apiet ierobežojumus vai automātiski izgūt saturu. Pārkāpuma gadījumā varam apturēt vai slēgt kontu.</p>

<h2>5. Saturs un intelektuālais īpašums</h2>
<p>Tavi dati paliek tavi. Mēs tos izmantojam tikai tā, kā aprakstīts privātuma politikā. Lietotne, tās dizains, teksti un zīmols pieder mums. Tev ir personiska, nenododama tiesība lietot lietotni atbilstoši šiem noteikumiem.</p>

<h2>6. Pieejamība un izmaiņas</h2>
<p>Mēs cenšamies, lai ZestWell darbotos nepārtraukti, bet negarantējam, ka tas būs vienmēr pieejams vai bez kļūdām. Funkcijas var mainīties. Par būtiskām izmaiņām šajos noteikumos paziņosim lietotnē iepriekš. Ja nepiekrīti, vari pārtraukt lietošanu un dzēst kontu.</p>

<h2>7. Atbildība</h2>
<p>Ciktāl to pieļauj normatīvie akti, mēs neatbildam par lēmumiem, kas pieņemti, paļaujoties uz lietotnes aptuvenajiem datiem vai ieteikumiem, kā arī par netiešiem zaudējumiem. Šis ierobežojums neattiecas uz atbildību, ko likums neļauj ierobežot, tostarp par tīšu vai rupju neuzmanību un patērētāju tiesībām.</p>

<h2>8. Piemērojamie tiesību akti</h2>
<p>Noteikumiem piemēro Latvijas Republikas tiesību aktus. Ja esi patērētājs citā ES valstī, tev saglabājas tavas valsts obligātā patērētāju aizsardzība. Strīdus vispirms centīsimies atrisināt sarunu ceļā (${mail}). Patērētāji var vērsties arī Patērētāju tiesību aizsardzības centrā (<a href="https://www.ptac.gov.lv">www.ptac.gov.lv</a>).</p>

<h2>9. Kontakti</h2>
<p>${owner()}. E-pasts: ${mail}.</p>
</article>`;
}

function deleteAccount(): string {
  return `
<article>
<h1>Konta un datu dzēšana</h1>
<p class="lead">Savu ZestWell kontu un visus datus vari dzēst jebkurā brīdī. Tas notiek uzreiz un nav atsaucams.</p>

<h2>Lietotnē</h2>
<ol>
<li>Atver ZestWell un pieskaries savam profila attēlam augšējā labajā stūrī (Es).</li>
<li>Sadaļā <b>Privātums un dati</b> izvēlies <b>Dzēst visus datus un kontu</b>.</li>
<li>Apstiprini.</li>
</ol>
<p>Ja vispirms vēlies saglabāt savus datus, tajā pašā sadaļā izvēlies <b>Eksportēt manus datus</b>.</p>

<h2>Bez lietotnes</h2>
<p>Ja lietotne vairs nav pieejama, raksti uz ${mail} no e-pasta adreses, ar kuru pieslēdzies, un temata rindā norādi “Dzēst kontu”. Kontu dzēsīsim un apstiprināsim to 30 dienu laikā, parasti ātrāk.</p>

<h2>Kas tiek dzēsts</h2>
<ul>
<li>Konts, profils, mērķi un iestatījumi.</li>
<li>Visas maltītes, foto, ūdens, svars, izlase un produkti ledusskapī.</li>
<li>Visi no Health Connect saņemtie dati: soļi, pulss, miegs, treniņi.</li>
<li>Personības testa rezultāti, padomi, jautājumi, kopsavilkumi un receptes.</li>
<li>Paziņojumu un pieslēgšanās marķieri.</li>
</ul>

<h2>Kas paliek</h2>
<ul>
<li>Health Connect datus mēs nekad nemainām. Tie paliek tavā telefonā, un tos pārvalda Health Connect.</li>
<li>Abonementa pirkuma ierakstus glabā Google Play vai App Store un RevenueCat. <b>Konta dzēšana neatceļ abonementu</b>, tāpēc atcel to veikala iestatījumos. Pēc pieprasījuma uz ${mail} lūgsim dzēst abonementa ierakstu arī RevenueCat.</li>
<li>Tehniskie žurnāli, kas nesatur e-pastu vai veselības datus, tiek dzēsti automātiski pēc ierobežota laika.</li>
</ul>

<p class="muted">Vari arī dzēst tikai personības profilu (Es → Privātums un dati → Dzēst personības profilu) vai atsaukt Health Connect atļaujas telefona iestatījumos, nedzēšot kontu.</p>
</article>`;
}

function support(): string {
  return `
<article>
<h1>Atbalsts</h1>
<p class="lead">Raksti mums: ${mail}. Parasti atbildam dažu darba dienu laikā.</p>

<h2>Biežākie jautājumi</h2>

<h3>Nesaņemu pieslēgšanās e-pastu</h3>
<p>Pārbaudi mēstuļu (spam) mapi. Saite ir derīga 15 minūtes un izmantojama vienu reizi. Atver to tajā pašā telefonā, kurā ir lietotne. Ja nepieciešams, pieprasi jaunu saiti.</p>

<h3>Nerādās soļi, pulss vai miegs</h3>
<p>Pārliecinies, ka pulksteņa lietotne sinhronizē datus ar Health Connect un ka ZestWell ir dota lasīšanas atļauja: telefona iestatījumi → Health Connect → Lietotņu atļaujas → ZestWell. Pēc tam atver ZestWell, lai dati sinhronizētos.</p>

<h3>Foto novērtējums nav precīzs</h3>
<p>Foto analīze ir aptuvena. Pēc analīzes vari labot produktus un porcijas, pirms saglabā maltīti.</p>

<h3>Kā mainīt padomu toni?</h3>
<p>Es → Personības profils → “Tie paši dati, cits tonis”. Tur vari izvēlēties citu toni. Turpat ir arī “Atgriezties uz neitrālu toni”, un sadaļā Privātums un dati vari dzēst personības profilu.</p>

<h3>Kā atcelt ZestWell Pro?</h3>
<p>Android: Google Play → profils → Maksājumi un abonementi → Abonementi → ZestWell → Atcelt. iPhone: Iestatījumi → tavs vārds → Abonementi. Pro paliek aktīvs līdz apmaksātā perioda beigām.</p>

<h3>Kā saņemt vai dzēst savus datus?</h3>
<p>Es → Privātums un dati → <b>Eksportēt manus datus</b> vai <b>Dzēst visus datus un kontu</b>. Vairāk: <a href="/dzest-kontu">Konta dzēšana</a>, <a href="/privatums">Privātuma politika</a>.</p>
</article>`;
}

export function notFoundBody(): string {
  return `
<section>
<h1>Šāda lapa nav atrasta</h1>
<p>Iespējams, saite ir novecojusi. <a href="/">Uz sākumu</a></p>
</section>`;
}

export const PAGES: Page[] = [
  { path: '/', title: 'ZestWell', description: 'Uzturs, kustība, pulss un miegs vienā vienkāršā ikdienas skatā, ar padomiem tev piemērotā tonī.', body: home },
  { path: '/privatums', title: 'Privātuma politika', description: 'Kādus datus apstrādā ZestWell, kāpēc, cik ilgi un kādas ir tavas tiesības.', body: privacy },
  { path: '/noteikumi', title: 'Lietošanas noteikumi', description: 'ZestWell lietošanas noteikumi un ZestWell Pro abonements.', body: terms },
  { path: '/dzest-kontu', title: 'Konta dzēšana', description: 'Kā dzēst savu ZestWell kontu un visus datus.', body: deleteAccount },
  { path: '/atbalsts', title: 'Atbalsts', description: 'ZestWell atbalsts un biežākie jautājumi.', body: support },
];
