// Статична збірка для GitHub Pages: дві мовні версії в одній теці.
//   node scripts/build-pages.mjs [/tork]     → dist/pages/{index.html, 404.html, uk/, en/}
// Корінь визначає мову (вибір у localStorage або часовий пояс України → uk, решта → en),
// 404.html відкриває SPA-оболонку потрібної мови для глибоких посилань.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const base = (process.argv[2] ?? process.env.BASE_PATH ?? '/tork').replace(/\/$/, '');
const out = 'dist/pages';

const build = (cfg, lang) => execSync(`npx ng build --configuration ${cfg} --base-href ${base}/${lang}/`, { stdio: 'inherit' });
build('pages', 'uk');
build('pages,pages-en', 'en');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('dist/tork/browser', `${out}/uk`, { recursive: true });
cpSync('dist/tork-en/browser', `${out}/en`, { recursive: true });
for (const f of ['icon.svg', 'og.png']) if (existsSync(`public/${f}`)) cpSync(`public/${f}`, `${out}/${f}`);

const detect = `var l='uk';try{var s=localStorage.getItem('lang');if(s==='uk'||s==='en'){l=s}else{var tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';l=/^Europe\\/(Kyiv|Kiev|Uzhgorod|Zaporozhye|Simferopol)$/.test(tz)?'uk':'en'}}catch(e){}`;
const page = (body) => `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Торк · Tork</title>
<link rel="icon" type="image/svg+xml" href="${base}/icon.svg">
<link rel="alternate" hreflang="uk" href="${base}/uk/">
<link rel="alternate" hreflang="en" href="${base}/en/">
<link rel="alternate" hreflang="x-default" href="${base}/en/">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;background:#f6f4f0;color:#1d1b17}a{color:inherit}@media (prefers-color-scheme:dark){body{background:#1b1a17;color:#ece8e1}}</style>
</head>
<body>
<p><a href="${base}/uk/" hreflang="uk">Українська</a> · <a href="${base}/en/" hreflang="en">English</a></p>
<script>${body}</script>
</body>
</html>
`;

// корінь: одразу на потрібну мову
writeFileSync(`${out}/index.html`, page(`(function(){${detect}location.replace('${base}/'+l+'/'+location.search+location.hash)})()`));

// глибокі посилання: /tork/en/naryady/… → оболонка англійської збірки; старі адреси без мови → з мовою
writeFileSync(
  `${out}/404.html`,
  page(`(function(){var b='${base}/';var p=location.pathname;var rest=p.indexOf(b)===0?p.slice(b.length):p.replace(/^\\//,'');var m=/^(uk|en)(\\/|$)/.exec(rest);
if(!m){${detect}location.replace(b+l+'/'+rest+location.search+location.hash);return}
fetch(b+m[1]+'/index.csr.html').then(function(r){if(!r.ok)throw r;return r.text()}).then(function(h){document.open();document.write(h);document.close()}).catch(function(){location.replace(b+m[1]+'/')})})()`),
);

writeFileSync(`${out}/robots.txt`, `# ${readFileSync('public/robots.txt', 'utf8').split('\n')[0].replace(/^#\s*/, '')}\nUser-agent: *\nAllow: ${base}/$\nAllow: ${base}/uk/$\nAllow: ${base}/en/$\nDisallow: ${base}/\n`);
writeFileSync(`${out}/.nojekyll`, '');
console.log(`✔ ${out}: ${base}/uk/ і ${base}/en/`);
