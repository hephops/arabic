// Brend to'plamini bitta manbadan yig'adi.
//
// Manba — buysale-mark.svg. Belgi o'zgarsa shu skript qayta ishga
// tushiriladi va qolgan hamma narsa (qulflar, ikonkalar, ilova ichidagi
// React komponenti) o'zi yangilanadi. Aks holda ular bir-biridan
// uzilib, ilovada eski, hujjatda yangi logo qolib ketardi.
//
//   node brand/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRAND = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BRAND, '..');
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const GREEN = '#21A038';
const BLUE = '#1B5CE8';
const NAVY = '#0E1B33';

const markFile = readFileSync(join(BRAND, 'buysale-mark.svg'), 'utf-8');
const viewBox = markFile.match(/viewBox="([^"]+)"/)[1];
const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);
const inner = markFile.split('</title>')[1].rsplit ? null : markFile.split('</title>')[1].replace(/<\/svg>\s*$/, '').trim();

/* ── 1. Qulflar ── */
const wordmark = (fill = NAVY) =>
  `<tspan fill="${fill}">Buy</tspan><tspan fill="${BLUE}">Sale</tspan>`;

writeFileSync(join(BRAND, 'buysale-logo.svg'),
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 940 206" role="img" aria-label="BuySale">
  <title>BuySale</title>
  <!-- Gorizontal qulf: belgi + nom. Sayt sarlavhasi va hujjat uchun. -->
  <g transform="translate(0,-8)">
${inner}
  </g>
  <text x="352" y="146" font-family="${FONT}" font-size="132" font-weight="800" letter-spacing="-4">
    ${wordmark()}
  </text>
</svg>
`);

writeFileSync(join(BRAND, 'buysale-logo-dark.svg'),
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 940 206" role="img" aria-label="BuySale">
  <title>BuySale</title>
  <!-- Qorong'i fon uchun: "Buy" oq bo'ladi -->
  <g transform="translate(0,-8)">
${inner}
  </g>
  <text x="352" y="146" font-family="${FONT}" font-size="132" font-weight="800" letter-spacing="-4">
    ${wordmark('#FFFFFF')}
  </text>
</svg>
`);

writeFileSync(join(BRAND, 'buysale-logo-stacked.svg'),
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 406" role="img" aria-label="BuySale — savdo, ombor, foyda">
  <title>BuySale</title>
  <!-- Tik qulf: belgi tepada, nom va shior pastda. -->
  <g transform="translate(157,8)">
${inner}
  </g>
  <text x="310" y="326" text-anchor="middle" font-family="${FONT}" font-size="118" font-weight="800" letter-spacing="-3.5">
    ${wordmark()}
  </text>
  <text x="310" y="374" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="600" letter-spacing="7" fill="#5B6472">
    SAVDO <tspan fill="${GREEN}">•</tspan> OMBOR <tspan fill="${BLUE}">•</tspan> FOYDA
  </text>
</svg>
`);

writeFileSync(join(BRAND, 'buysale-wordmark.svg'),
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 156" role="img" aria-label="BuySale">
  <title>BuySale</title>
  <!-- Faqat nom — belgi allaqachon yonida turgan joylar uchun -->
  <text x="0" y="122" font-family="${FONT}" font-size="132" font-weight="800" letter-spacing="-4">
    ${wordmark()}
  </text>
</svg>
`);

/* ── 2. Ilova ichidagi React komponenti ──
   Ikkala ilovada bir xil fayl: belgi o'zgarsa qo'lda ko'chirib
   yurmaslik uchun shu yerdan yoziladi. */
const jsx = inner
  .replace(/stroke-width/g, 'strokeWidth')
  .replace(/stroke-linecap/g, 'strokeLinecap')
  .replace(/stroke-linejoin/g, 'strokeLinejoin')
  .replace(new RegExp(GREEN, 'g'), '{green}')
  .replace(new RegExp(BLUE, 'g'), '{blue}')
  .replace(/"\{(green|blue)\}"/g, '{$1}')
  .replace(/<!--([\s\S]*?)-->/g, '{/*$1*/}');

const component = `// AVTOMATIK YOZILADI — qo'lda tahrirlamang.
// Manba: brand/buysale-mark.svg, yig'uvchi: brand/build.mjs
//
// Belgi inline turadi: rangi va o'lchami ekranga qarab moslashadi,
// qo'shimcha so'rov ketmaydi va chop etishda ham chiqadi.

/** Brend belgisi. mono — bitta rangda (currentColor). */
export function Logo({ size = 32, mono }: { size?: number; mono?: boolean }) {
  const green = mono ? 'currentColor' : '${GREEN}';
  const blue = mono ? 'currentColor' : '${BLUE}';
  return (
    <svg
      width={size}
      height={(size * ${vbH}) / ${vbW}}
      viewBox="${viewBox}"
      role="img"
      aria-label="BuySale"
    >
${jsx.split('\n').map((l) => (l.trim() ? '      ' + l.trim() : l)).join('\n')}
    </svg>
  );
}

/** Nom: "Buy" to'q, "Sale" ko'k */
export function Wordmark({ light }: { light?: boolean }) {
  return (
    <span className="wordmark">
      <b style={light ? { color: '#fff' } : undefined}>Buy</b>
      <i>Sale</i>
    </span>
  );
}
`;
for (const app of ['miniapp', 'admin']) {
  writeFileSync(join(ROOT, app, 'src', 'brand.tsx'), component);
}

/* ── 3. Ilova ikonkalari va favicon ──
   PNG yasash uchun playwright kerak. U bo'lmasa bu qadam o'tkazib
   yuboriladi: SVG'lar va komponent baribir yangilanadi, tayyor PNG'lar
   esa repoda turibdi. */
let chromium = null;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log("playwright topilmadi — ikonkalar qayta yasalmadi (SVG va komponent yangilandi)");
}
if (!chromium) {
  writeFileSync(join(ROOT, 'miniapp', 'public', 'favicon.svg'), markFile);
  writeFileSync(join(ROOT, 'admin', 'public', 'favicon.svg'), markFile);
  console.log("brend to'plami yig'ildi");
  process.exit(0);
}

const svgTag = readFileSync(join(BRAND, 'buysale-mark.svg'), 'utf-8')
  .replace('<svg', '<svg style="width:100%;height:auto;display:block"');
const svgWhite = svgTag.replace(new RegExp(GREEN, 'g'), '#fff').replace(new RegExp(BLUE, 'g'), '#fff');

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
async function shot(size, html, file) {
  const p = await (await b.newContext({ viewport: { width: size, height: size } })).newPage();
  await p.setContent(`<body style="margin:0;width:${size}px;height:${size}px;overflow:hidden">${html}</body>`);
  await p.waitForTimeout(150);
  await p.screenshot({ path: file });
  await p.close();
}
// Oddiy ikonka: oq fon, belgi markazda
const plain = (s) => `<div style="width:${s}px;height:${s}px;background:#fff;display:flex;align-items:center;justify-content:center">
  <div style="width:${Math.round(s * 0.72)}px">${svgTag}</div></div>`;
// Maskali: Android ikonkani kesadi, shuning uchun belgi markazdagi
// xavfsiz doiraga sig'diriladi
const maskable = (s) => `<div style="width:${s}px;height:${s}px;background:linear-gradient(145deg,${GREEN},${BLUE});display:flex;align-items:center;justify-content:center">
  <div style="width:${Math.round(s * 0.55)}px">${svgWhite}</div></div>`;

const PUB = join(ROOT, 'miniapp', 'public');
await shot(192, plain(192), join(PUB, 'icon-192.png'));
await shot(512, plain(512), join(PUB, 'icon-512.png'));
await shot(512, maskable(512), join(PUB, 'icon-maskable-512.png'));
await shot(180, plain(180), join(PUB, 'apple-touch-icon.png'));
await b.close();

writeFileSync(join(PUB, 'favicon.svg'), markFile);
writeFileSync(join(ROOT, 'admin', 'public', 'favicon.svg'), markFile);

console.log("brend to'plami yig'ildi");
