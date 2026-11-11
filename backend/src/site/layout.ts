import { OWNER, ownerLine } from './owner';

/**
 * Shared HTML shell for the public website (zestwell.app). Plain server-rendered HTML:
 * no JavaScript, no cookies, no third-party requests (fonts fall back to system fonts,
 * so visitors' IP addresses are not sent to a font CDN).
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

const CSS = `:root{--bg:#F6F2EA;--card:#FFFFFF;--ink:#1F2420;--text2:#525852;--line:#E6E0D4;--link:#2A6148;--btn:#2F6B4F;--on-btn:#FFFFFF;--soft:#E3EFE6;--lime:#D6EE8A;--on-lime:#1A2410}
@media (prefers-color-scheme:dark){:root{--bg:#121513;--card:#1C201D;--ink:#F2F1EC;--text2:#B8BCB6;--line:#2A2F2B;--link:#7FD3A2;--btn:#6CCB94;--on-btn:#0E1A13;--soft:#1F2E25;--lime:#CFE884;--on-lime:#1A2410}}
*{box-sizing:border-box}
body{margin:0;font-family:Manrope,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;font-size:17px;-webkit-text-size-adjust:100%}
a{color:var(--link)}
.wrap{max-width:760px;margin:0 auto;padding:0 16px}
header{padding:20px 0}
header .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font-family:Fraunces,Georgia,"Times New Roman",serif;font-size:22px;font-weight:600}
nav{display:flex;gap:4px;flex-wrap:wrap}
nav a{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border-radius:22px;text-decoration:none;color:var(--text2);font-size:15px;font-weight:600}
nav a[aria-current=page]{background:var(--soft);color:var(--ink)}
main{padding:8px 0 40px}
.card{background:var(--card);border-radius:24px;padding:28px 24px;margin:0 0 16px}
h1,h2,h3{font-family:Fraunces,Georgia,"Times New Roman",serif;font-weight:600;line-height:1.25}
h1{font-size:32px;margin:0 0 12px}h2{font-size:22px;margin:32px 0 8px}h3{font-size:18px;margin:20px 0 6px}
.card>h2:first-child{margin-top:0}
p,ul,ol{margin:0 0 14px}li{margin:0 0 6px}
.lead{font-size:19px;color:var(--text2)}
.muted{color:var(--text2);font-size:15px}
.hero{padding:32px 24px}
.hero h1{font-size:40px}
.pill{display:inline-flex;align-items:center;min-height:44px;padding:12px 22px;border-radius:28px;background:var(--btn);color:var(--on-btn);font-weight:700;text-decoration:none}
.focus{background:var(--lime);color:var(--on-lime);border-radius:24px;padding:24px;margin:0 0 16px}
.focus h2{margin:0 0 6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin:0 0 16px}
.grid .card{margin:0}
.grid h3{margin-top:0}
table{width:100%;border-collapse:collapse;font-size:15px;margin:0 0 14px}
th,td{text-align:left;vertical-align:top;padding:10px 8px;border-bottom:1px solid var(--line)}
th{font-weight:700}
.table{overflow-x:auto}
footer{border-top:1px solid var(--line);padding:24px 0 40px;font-size:14px;color:var(--text2)}
footer nav{margin:0 0 8px}footer nav a{padding:0 12px 0 0;min-height:44px}
.brand,nav a{flex-shrink:0}
main,.card,td{overflow-wrap:anywhere}
@media (max-width:600px){header .wrap{flex-direction:column;align-items:flex-start;gap:4px}nav{margin-left:-12px}
table,tbody,tr,td{display:block;width:100%}tr:first-child{display:none}tr{padding:12px 0;border-bottom:1px solid var(--line)}td{border:0;padding:2px 0}
td[data-label]::before{content:attr(data-label) ": ";font-weight:700;color:var(--text2)}}
@media (max-width:480px){h1{font-size:28px}.hero h1{font-size:32px}.card{padding:22px 18px}}`;

export function layout(opts: { title: string; description: string; path: string; body: string; webUrl: string }): string {
  const nav = NAV.map((n) => `<a href="${n.href}"${n.href === opts.path ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
  const title = opts.path === '/' ? 'ZestWell — ikdienas veselības pavadonis' : `${opts.title} · ZestWell`;
  return `<!doctype html>
<html lang="lv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${opts.description}">
<link rel="canonical" href="${opts.webUrl}${opts.path === '/' ? '/' : opts.path}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#2F6B4F">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${opts.description}">
<meta property="og:type" content="website">
<style>${CSS}</style>
</head>
<body>
<header><div class="wrap"><a class="brand" href="/">${logoSvg(36)}<span>ZestWell</span></a><nav aria-label="Galvenā navigācija">${nav}</nav></div></header>
<main><div class="wrap">
${opts.body}
</div></main>
<footer><div class="wrap">
<nav aria-label="Juridiskā informācija"><a href="/privatums">Privātuma politika</a><a href="/noteikumi">Lietošanas noteikumi</a><a href="/dzest-kontu">Konta dzēšana</a><a href="/atbalsts">Atbalsts</a></nav>
<p>© 2026 ${ownerLine()}. <a href="mailto:${OWNER.email}">${OWNER.email}</a></p>
<p>ZestWell nav medicīniska ierīce un nesniedz medicīniskus padomus.</p>
</div></footer>
</body>
</html>`;
}
