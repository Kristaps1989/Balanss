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

function home(): string {
  return `
<section class="card hero">
  <h1>Tava diena vienā skatā.</h1>
  <p class="lead">ZestWell apvieno uzturu, kustību, pulsu un miegu vienā vienkāršā ikdienas skatā. Nofotografē maltīti, un pārējo paveiksim mēs.</p>
  <p><a class="pill" href="${APK.url}" download>Lejupielādēt Android lietotni</a></p>
  <p class="muted">Testa versija ${APK.version} · ${APK.sizeMb} MB · Android ${APK.minAndroid} vai jaunāka. Drīzumā Google Play, vēlāk arī App Store.</p>
</section>

<section class="focus">
  <h2>Padomi tavā valodā</h2>
  <p>Īss personības tests sākumā palīdz izvēlēties toni, kas tev der: plāns un skaitļi, kaut kas jauns vai maigi un bez spiediena. Tie paši dati, cits pasniegšanas veids.</p>
</section>

<div class="grid">
  <section class="card"><h3>Maltīte ar vienu foto</h3><p>Nofotografē šķīvi, un ZestWell aptuveni novērtē kalorijas, olbaltumvielas, ogļhidrātus, taukus, šķiedrvielas un kalciju.</p></section>
  <section class="card"><h3>Dati no pulksteņa</h3><p>Soļi, pulss, treniņi un miegs no Health Connect. Tikai lasām, nekad neko nemainām.</p></section>
  <section class="card"><h3>Ieradumi, nevis diētas</h3><p>Progress pirmajā vietā: “68 g jau ir, vēl 42 g”. Nekādas sarkanās krāsas par pārsniegtu mērķi.</p></section>
  <section class="card"><h3>Tavi dati ES</h3><p>Serveri Eiropas Savienībā. Eksportē vai dzēs visus savus datus jebkurā brīdī no lietotnes.</p></section>
</div>

<section class="card" id="instalet">
  <h2>Kā instalēt testa versiju</h2>
  <ol>
    <li>Atver šo lapu Android telefonā un pieskaries <b>Lejupielādēt Android lietotni</b>.</li>
    <li>Atver lejupielādēto failu <b>zestwell.apk</b>. Ja telefons jautā, atļauj pārlūkam instalēt nezināmas lietotnes.</li>
    <li>Pieskaries <b>Instalēt</b>, atver ZestWell un pieslēdzies ar e-pastu.</li>
  </ol>
  <p class="muted">Ja telefonā jau ir agrāka ZestWell vai Balanss testa versija un instalēšana neizdodas, vispirms to atinstalē. Faila SHA-256: <code style="overflow-wrap:anywhere">${APK.sha256}</code></p>
</section>

<section class="card">
  <h2>Svarīgi</h2>
  <p>ZestWell ir ikdienas ieradumu pavadonis, nevis medicīniska ierīce. Tas nesniedz diagnozes vai ārstēšanas ieteikumus. Ja tev ir veselības stāvoklis, mērķus un uzturu pārrunā ar ārstu.</p>
  <p class="muted">Jautājumi? Raksti ${mail}.</p>
</section>`;
}

function privacy(): string {
  return `
<article class="card">
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
<article class="card">
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
<article class="card">
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
<article class="card">
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
<section class="card">
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
