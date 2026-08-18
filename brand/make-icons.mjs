// Ilova ikonkalarini belgidan yasaydi (SVG -> PNG).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const B = '/home/user/arabic/brand/';
const OUT = '/home/user/arabic/miniapp/public/';
const mark = readFileSync(B + 'buysale-mark.svg', 'utf-8').replace('<svg', '<svg style="width:100%;height:auto;display:block"');
const markWhite = mark.replace(/#21A038/g, '#ffffff').replace(/#1B5CE8/g, '#ffffff');

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });

async function shot(size, html, file) {
  const p = await (await b.newContext({ viewport: { width: size, height: size } })).newPage();
  await p.setContent(`<body style="margin:0;width:${size}px;height:${size}px;overflow:hidden">${html}</body>`);
  await p.waitForTimeout(200);
  await p.screenshot({ path: file, omitBackground: false });
  await p.close();
}

// Oddiy ikonka: oq fon, belgi markazda (72%)
const plain = (s) => `<div style="width:${s}px;height:${s}px;background:#fff;display:flex;align-items:center;justify-content:center">
  <div style="width:${Math.round(s * 0.72)}px">${mark}</div></div>`;

// Maskali ikonka: gradient fon, oq belgi. Android ikonkani kesadi,
// shuning uchun belgi markazdagi xavfsiz doiraga (60%) sig'diriladi.
const maskable = (s) => `<div style="width:${s}px;height:${s}px;background:linear-gradient(145deg,#21A038,#1B5CE8);display:flex;align-items:center;justify-content:center">
  <div style="width:${Math.round(s * 0.55)}px">${markWhite}</div></div>`;

await shot(192, plain(192), OUT + 'icon-192.png');
await shot(512, plain(512), OUT + 'icon-512.png');
await shot(512, maskable(512), OUT + 'icon-maskable-512.png');
await shot(180, plain(180), OUT + 'apple-touch-icon.png');
await shot(512, maskable(512), '/tmp/claude-0/-home-user-arabic/55fc8e5c-c9e3-525e-b9be-9d4f00b5099e/scratchpad/icon-preview-maskable.png');
await b.close();
console.log('ikonkalar yasaldi');
