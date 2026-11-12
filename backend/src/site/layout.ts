import { OWNER, ownerLine } from './owner';

/**
 * Shared HTML shell for the public website (zestwell.app). Plain server-rendered HTML:
 * no JavaScript, no cookies, no third-party requests. Manrope is served from this host
 * (see fonts.ts), so visitors' IP addresses are not sent to a font CDN.
 */

/** The ZestWell mark: same geometry as src/components/Brand.tsx and scripts/make_logo.py. */
export function logoSvg(size: number): string {
  const spokes = Array.from({ length: 7 }, (_, k) => {
    const a = ((-78 + (k * 360) / 7) * Math.PI) / 180;
    return `<path d="M22.5 26.5L${(22.5 + Math.cos(a) * 10).toFixed(2)} ${(26.5 + Math.sin(a) * 10).toFixed(2)}" stroke="#F6F9E4" stroke-width="1.1"/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" role="img" aria-label="ZestWell" xmlns="http://www.w3.org/2000/svg">
<rect width="48" height="48" rx="11" fill="#2F6B4F"/>
<path d="M28.5 18.9Q36.3 17.5 33.1 10.25Q25.3 11.6 28.5 18.9Z" fill="#8ED6A5"/>
<path d="M28.5 18.9L32.1 12.15" stroke="#2F6B4F" stroke-width="0.6"/>
<circle cx="22.5" cy="26.5" r="12.5" fill="#A9CC4A"/><circle cx="22.5" cy="26.5" r="10.6" fill="#F6F9E4"/><circle cx="22.5" cy="26.5" r="9.6" fill="#D6EE8A"/>
${spokes}<circle cx="22.5" cy="26.5" r="1.6" fill="#F6F9E4"/></svg>`;
}

export function faviconSvg(): string {
  return logoSvg(48);
}

/** Table whose cells carry their column name, so on a phone each row stacks as "Column: value". */
export function table(headers: string[], rows: string[][]): string {
  const head = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const body = rows
    .map((row) => `<tr>${row.map((cell, i) => (i === 0 ? `<td>${cell}</td>` : `<td data-label="${headers[i]}">${cell}</td>`)).join('')}</tr>`)
    .join('\n');
  return `<div class="table"><table>
${head}
${body}
</table></div>`;
}

const NAV = [
  { href: '/privatums', label: 'Privātums' },
  { href: '/noteikumi', label: 'Noteikumi' },
  { href: '/atbalsts', label: 'Atbalsts' },
];

export const FONT_WEIGHTS = [300, 400, 600, 700] as const;

const FONT_FACES = FONT_WEIGHTS.map(
  (w) => `@font-face{font-family:Manrope;font-style:normal;font-weight:${w};font-display:swap;src:url(/fonts/manrope-${w}.woff2) format("woff2")}`,
).join('\n');

/**
 * One typeface (Manrope): light for the big numbers, semibold and tight for headings.
 * The home page follows one day, so its sections take the light of that hour (morning,
 * midday, evening, night); those colours are fixed. Text pages follow the visitor's
 * light or dark setting.
 */
const CSS = `${FONT_FACES}
:root{--forest:#12382A;--forest-deep:#0B2219;--zest:#D6EE8A;--on-zest:#17240C;--pith:#F4F6EA;--peach:#FBE9DA;--night:#131935;--ink:#0E1B14;--ink2:#4A584F;
--bg:#F7F8F2;--fg:#0E1B14;--fg2:#4A584F;--line:#E0E4D6;--link:#1F6A4A;--soft:#E7EEDF}
@media (prefers-color-scheme:dark){:root{--bg:#0D1512;--fg:#EEF1EA;--fg2:#A9B3AB;--line:#22302A;--link:#7FD3A2;--soft:#18261F}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:Manrope,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:18px;line-height:1.55;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--link);text-underline-offset:.18em}
:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:6px}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
h1,h2,h3{font-weight:600;letter-spacing:-.03em;line-height:1.08;margin:0;text-wrap:balance}
p,ul,ol{margin:0 0 16px}
b{font-weight:700}

.top{padding:20px 0}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:inline-flex;align-items:center;gap:10px;min-height:44px;text-decoration:none;color:inherit;font-size:20px;font-weight:600;letter-spacing:-.02em}
.top nav{display:flex;gap:4px}
.top nav a{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:22px;text-decoration:none;color:inherit;opacity:.72;font-size:15px;font-weight:600}
.top nav a:hover,.top nav a[aria-current=page]{opacity:1}
.top nav a[aria-current=page]{background:var(--soft)}
.home .top{position:absolute;inset:0 0 auto;z-index:2;color:#F1F5EC}

.btn{display:inline-flex;align-items:center;justify-content:center;min-height:56px;padding:0 30px;border-radius:28px;background:var(--zest);color:var(--on-zest);font-size:17px;font-weight:700;text-decoration:none;letter-spacing:-.01em}
.btn:hover{background:#E2F5A3}
.btn.dark{background:var(--forest);color:#F1F5EC}
.btn.dark:hover{background:#1A4B39}

.hero{position:relative;overflow:hidden;color:#F1F5EC;background:radial-gradient(110% 85% at 76% 38%,#22604A 0%,#12382A 46%,#0B2219 100%)}
.hero .wrap{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:48px;align-items:center;padding-top:132px}
.hero h1{font-size:clamp(2.75rem,7.2vw,5.75rem);letter-spacing:-.045em;line-height:.98;margin:0 0 28px}
.hero .lead{font-size:clamp(1.1rem,1.6vw,1.3rem);line-height:1.5;color:rgba(241,245,236,.78);max-width:29em;margin:0 0 36px}
.hero .meta{font-size:14px;color:rgba(241,245,236,.6);margin:18px 0 0;max-width:34em}
.hero-copy{padding-bottom:96px}

.phone{width:320px;margin:0 auto -120px;padding:10px;border-radius:54px;background:#050806;box-shadow:0 0 0 1px rgba(255,255,255,.09),0 70px 120px -40px rgba(0,0,0,.7)}
.screen{height:680px;border-radius:44px;background:#0F1411;color:#F2F1EC;padding:14px 18px 0;display:flex;flex-direction:column;gap:16px;font-size:12px;line-height:1.35;overflow:hidden}
.p-status{display:flex;justify-content:space-between;font-weight:600;font-size:12px;padding:0 6px}
.p-head{display:flex;justify-content:space-between;align-items:center}
.p-date{color:#A2A79F;font-size:11px;font-weight:600}
.p-hello{font-size:22px;font-weight:600;letter-spacing:-.03em;line-height:1.2}
.p-avatar{width:36px;height:36px;border-radius:50%;background:#262B27;display:grid;place-items:center;font-weight:700;font-size:14px}
.p-ring{position:relative;width:196px;height:196px;margin:2px auto 0}
.p-ring svg{display:block}
.p-ring div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.p-ring b{font-weight:300;font-size:60px;letter-spacing:-.05em;line-height:1}
.p-ring span{color:#B8BCB6;font-size:12px;margin-top:4px}
.p-macros{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.p-macros span{display:block;color:#A2A79F;font-size:11px}
.p-macros b{display:block;font-size:14px;font-weight:600;margin:1px 0 7px}
.p-macros i,.bar{display:block;height:3px;border-radius:2px;background:#262B27;overflow:hidden}
.p-macros i::after,.bar::after{content:"";display:block;height:100%;width:var(--v);border-radius:2px;background:var(--c)}
.p-focus{background:#CFE884;color:#1A2410;border-radius:22px;padding:14px 16px}
.p-focus b{display:block;font-size:11px;font-weight:700;margin-bottom:4px}
.p-focus p{font-size:13.5px;line-height:1.4;margin:0 0 10px}
.p-focus span{display:inline-block;background:#1A2410;color:#CFE884;border-radius:16px;padding:7px 14px;font-weight:600;font-size:12px}
.p-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.p-tiles div{background:#1A1F1C;border-radius:18px;padding:11px 12px}
.p-tiles span{display:block;color:#A2A79F;font-size:11px}
.p-tiles b{font-size:17px;font-weight:600;letter-spacing:-.02em}
.p-tabs{margin:auto -18px 0;padding:10px 14px 18px;display:grid;grid-template-columns:repeat(5,1fr);align-items:center;justify-items:center;border-top:1px solid #1F2521;color:#8A908A;font-size:10px;font-weight:600}
.p-tabs span{display:flex;flex-direction:column;align-items:center;gap:3px}
.p-tabs .on{color:#6CCB94}
.p-tabs .plus{width:44px;height:44px;border-radius:50%;background:#CFE884;color:#1A2410;font-size:24px;font-weight:400;justify-content:center}

.moment{padding:clamp(80px,11vw,152px) 0}
.moment .wrap{display:grid;grid-template-columns:132px minmax(0,1fr) minmax(0,440px);gap:40px;align-items:start}
.time{font-weight:300;font-size:2.6rem;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums}
.time span{display:block;font-size:15px;font-weight:600;letter-spacing:0;margin-top:10px;opacity:.6}
.moment h2{font-size:clamp(2rem,4.4vw,3.5rem);margin:0 0 20px}
.moment p{font-size:1.15rem;max-width:27em;color:var(--ink2)}
.moment .note{font-size:15px;opacity:.85}
.m-morning{background:var(--pith);color:var(--ink)}
.m-day{background:#fff;color:var(--ink)}
.m-evening{background:var(--peach);color:var(--ink)}
.m-night{background:var(--night);color:#ECEFFA}
.m-night p{color:#AEB7DE}

.ui{border-radius:28px;padding:26px;font-size:15px;line-height:1.4}
.ui small{display:block;font-size:13px;opacity:.62}
.ui .big{font-weight:300;font-size:3.6rem;letter-spacing:-.05em;line-height:1;font-variant-numeric:tabular-nums}
.ui .big em{font-style:normal;font-size:1.1rem;font-weight:600;letter-spacing:0;margin-left:6px}
.m-morning .ui{background:#fff}
.m-day .ui{background:var(--pith)}
.m-night .ui{background:#1B2247}
.plate{position:relative;height:200px;border-radius:20px;margin:0 0 20px;background:#17211B;overflow:hidden}
.plate::before{content:"";position:absolute;inset:18px;border-radius:14px;background:
linear-gradient(#F5B48F,#F5B48F) left top/22px 2px no-repeat,linear-gradient(#F5B48F,#F5B48F) left top/2px 22px no-repeat,
linear-gradient(#F5B48F,#F5B48F) right top/22px 2px no-repeat,linear-gradient(#F5B48F,#F5B48F) right top/2px 22px no-repeat,
linear-gradient(#F5B48F,#F5B48F) left bottom/22px 2px no-repeat,linear-gradient(#F5B48F,#F5B48F) left bottom/2px 22px no-repeat,
linear-gradient(#F5B48F,#F5B48F) right bottom/22px 2px no-repeat,linear-gradient(#F5B48F,#F5B48F) right bottom/2px 22px no-repeat}
.plate svg{position:absolute;inset:0;margin:auto}
.rows{list-style:none;margin:18px 0 0;padding:0}
.rows li{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid rgba(14,27,20,.09);margin:0}
.rows li span::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c);margin-right:10px}
.rows b{font-weight:600;font-variant-numeric:tabular-nums}
.cols{display:flex;align-items:flex-end;justify-content:space-between;height:120px;margin:26px 0 10px}
.cols i{width:10px;height:var(--h);border-radius:5px;background:#2A8576}
.cols i.rest{background:#CBD9CF}
.axis{display:flex;justify-content:space-between;font-size:12px;opacity:.55;font-variant-numeric:tabular-nums}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px;padding-top:18px;border-top:1px solid rgba(14,27,20,.09)}
.pair b{display:block;font-size:1.5rem;font-weight:600;letter-spacing:-.03em}
.tones{display:grid;gap:12px}
.tone{border-radius:24px;padding:22px 24px;background:rgba(255,255,255,.62)}
.tone.on{background:var(--zest);color:var(--on-zest)}
.tone b{display:block;font-size:14px;margin-bottom:6px}
.tone p{font-size:1.02rem;line-height:1.45;margin:0;max-width:none;color:inherit}
.stages{display:flex;gap:3px;height:10px;margin:26px 0 14px}
.stages i{border-radius:5px}
.legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:#C9D1EA}
.legend span::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c);margin-right:7px}
.window{margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,.1);display:flex;justify-content:space-between;align-items:baseline}
.window b{font-size:1.5rem;font-weight:600;letter-spacing:-.03em;color:#F5B48F;font-variant-numeric:tabular-nums}

.promise{background:#fff;color:var(--ink);padding:clamp(80px,11vw,152px) 0}
.promise h2{font-size:clamp(2rem,4.4vw,3.5rem);margin:0 0 20px}
.promise .said{font-weight:300;font-size:clamp(2.4rem,7vw,5.5rem);letter-spacing:-.05em;line-height:1.02;margin:0 0 28px;color:var(--forest)}
.promise .blurb{font-size:1.15rem;color:var(--ink2);max-width:30em}
.trust{display:grid;grid-template-columns:repeat(3,1fr);gap:40px;margin-top:clamp(56px,7vw,96px);padding-top:40px;border-top:1px solid #E0E4D6}
.trust h3{font-size:1.25rem;letter-spacing:-.02em;margin:0 0 8px}
.trust p{font-size:1rem;color:var(--ink2);margin:0}

.install{background:var(--zest);color:var(--on-zest);padding:clamp(72px,9vw,120px) 0}
.install .wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:start}
.install h2{font-size:clamp(2rem,4.4vw,3.5rem);margin:0 0 28px}
.install .meta{font-size:14px;margin:18px 0 0;opacity:.8}
.install .meta a{color:inherit}
.nb{white-space:nowrap}
.steps{list-style:none;counter-reset:s;margin:0;padding:0}
.steps li{counter-increment:s;display:grid;grid-template-columns:44px 1fr;gap:6px;padding:18px 0;border-top:1px solid rgba(23,36,12,.18);font-size:1.05rem;margin:0}
.steps li::before{content:counter(s);font-weight:300;font-size:1.7rem;line-height:1.1}
.sha{font-size:13px;opacity:.75;margin:22px 0 0;overflow-wrap:anywhere}
.sha code{font-family:inherit;font-variant-numeric:tabular-nums}

.prose{max-width:720px;margin:0 auto;padding:32px 24px 96px;overflow-wrap:anywhere}
.prose h1{font-size:clamp(2.2rem,6vw,3.4rem);letter-spacing:-.04em;margin:0 0 20px}
.prose h2{font-size:1.5rem;letter-spacing:-.02em;line-height:1.2;margin:48px 0 12px}
.prose h3{font-size:1.15rem;letter-spacing:-.01em;line-height:1.3;margin:32px 0 8px}
.prose li{margin:0 0 8px}
.lead{font-size:1.25rem;color:var(--fg2)}
.muted{color:var(--fg2);font-size:15px}
table{width:100%;border-collapse:collapse;font-size:15px;margin:0 0 16px}
th,td{text-align:left;vertical-align:top;padding:12px 10px 12px 0;border-bottom:1px solid var(--line)}
th{font-weight:700}
.table{overflow-x:auto}

footer{background:var(--forest-deep);color:rgba(241,245,236,.66);padding:56px 0 64px;font-size:14px}
footer a{color:#F1F5EC}
footer .wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:40px}
footer nav{display:flex;flex-wrap:wrap;gap:0 22px;margin:14px 0 0}
footer nav a{display:inline-flex;align-items:center;min-height:44px;text-decoration:none;font-weight:600}
footer .brand{color:#F1F5EC}
footer p{margin:0 0 10px;max-width:38em}

@media (max-width:900px){
.hero .wrap{grid-template-columns:1fr;gap:8px;padding-top:112px}
.hero-copy{padding-bottom:40px}
.moment .wrap{grid-template-columns:1fr;gap:20px}
.time{display:flex;align-items:baseline;gap:12px;font-size:2rem}
.time span{margin:0}
.ui{margin-top:16px}
.trust{grid-template-columns:1fr;gap:28px}
.install .wrap,footer .wrap{grid-template-columns:1fr;gap:36px}
}
@media (max-width:600px){
body{font-size:17px}
.wrap{padding:0 20px}
.top nav a{padding:0 9px;font-size:14px}
.brand span{display:none}
.btn{width:100%}
.phone{width:300px}
.ui{padding:22px}
table,tbody,tr,td{display:block;width:100%}tr:first-child{display:none}tr{padding:12px 0;border-bottom:1px solid var(--line)}td{border:0;padding:2px 0}
td[data-label]::before{content:attr(data-label) ": ";font-weight:700;color:var(--fg2)}
}`;

export function layout(opts: { title: string; description: string; path: string; body: string; webUrl: string }): string {
  const home = opts.path === '/';
  const nav = NAV.map((n) => `<a href="${n.href}"${n.href === opts.path ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
  const title = home ? 'ZestWell — ikdienas veselības pavadonis' : `${opts.title} · ZestWell`;
  return `<!doctype html>
<html lang="lv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${opts.description}">
<link rel="canonical" href="${opts.webUrl}${home ? '/' : opts.path}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/manrope-600.woff2" as="font" type="font/woff2" crossorigin>
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#12382A">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${opts.description}">
<meta property="og:type" content="website">
<style>${CSS}</style>
</head>
<body${home ? ' class="home"' : ''}>
<header class="top"><div class="wrap"><a class="brand" href="/" aria-label="ZestWell">${logoSvg(34)}<span>ZestWell</span></a><nav aria-label="Galvenā navigācija">${nav}</nav></div></header>
<main>
${home ? opts.body : `<div class="prose">${opts.body}</div>`}
</main>
<footer><div class="wrap">
<div><a class="brand" href="/">${logoSvg(34)}<span>ZestWell</span></a>
<nav aria-label="Juridiskā informācija"><a href="/privatums">Privātuma politika</a><a href="/noteikumi">Lietošanas noteikumi</a><a href="/dzest-kontu">Konta dzēšana</a><a href="/atbalsts">Atbalsts</a></nav></div>
<div><p>ZestWell ir ikdienas ieradumu pavadonis, nevis medicīniska ierīce. Tas nesniedz diagnozes vai ārstēšanas ieteikumus. Ja tev ir veselības stāvoklis, mērķus un uzturu pārrunā ar ārstu.</p>
<p>© 2026 ${ownerLine()}. <a href="mailto:${OWNER.email}">${OWNER.email}</a></p></div>
</div></footer>
</body>
</html>`;
}
