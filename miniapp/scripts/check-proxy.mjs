// Vite proksi ro'yxati backend marshrutlariga to'liq mos kelishini tekshiradi.
//
// Nega kerak: brauzer barcha so'rovni Vite serveriga yuboradi, Vite esa
// faqat vite.config.ts dagi API_PREFIXES ro'yxatidagi manzillarni backendga
// uzatadi. Ro'yxatga qo'shishni unutgan marshrut backendga umuman yetib
// bormaydi va HTTP 404 bo'lib qaytadi — bunda backend loglarida hech narsa
// ko'rinmaydi, shuning uchun sababi topilmay uzoq vaqt yashirinib yotadi.
// Aynan shunday bo'lgan: "/supplier-debts" va "/debts" ro'yxatda yo'q edi,
// postavshikka qarz yozish va qarz yozish ishlamay turgan edi.
//
// Shu sababli har build/dev oldidan avtomatik tekshiramiz.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, '..', '..', 'backend', 'src', 'server.ts');
const configPath = join(here, '..', 'vite.config.ts');

// Backend alohida joyda bo'lsa (masalan faqat frontend deploy qilinsa) —
// tekshiruvni jimgina o'tkazib yuboramiz, build to'xtab qolmasin.
if (!existsSync(serverPath)) process.exit(0);

const server = readFileSync(serverPath, 'utf8');
const config = readFileSync(configPath, 'utf8');

/** server.ts dagi barcha marshrutlarning birinchi bo'g'ini */
const routePrefixes = new Set();
const routeRe = /app\.(?:get|post|patch|delete|put)[\s\S]{0,200}?'(\/[a-zA-Z0-9/:_-]+)'/g;
for (const m of server.matchAll(routeRe)) {
  const first = m[1].replace(/^\//, '').split('/')[0];
  if (first) routePrefixes.add(first);
}

/** vite.config.ts dagi API_PREFIXES ro'yxati */
const listBlock = config.split('API_PREFIXES = [')[1]?.split(']')[0] ?? '';
const listed = new Set([...listBlock.matchAll(/'([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]));

const missing = [...routePrefixes].filter((p) => !listed.has(p)).sort();

if (missing.length) {
  console.error('\n\x1b[31m✗ Vite proksi ro\'yxati to\'liq emas!\x1b[0m');
  console.error('\n  backend/src/server.ts da bor, lekin miniapp/vite.config.ts dagi');
  console.error('  API_PREFIXES ro\'yxatida YO\'Q marshrutlar:\n');
  for (const p of missing) console.error(`    • /${p}`);
  console.error('\n  Bular brauzerdan chaqirilganda HTTP 404 bo\'lib qaytadi.');
  console.error('  Yechim: shu nomlarni vite.config.ts dagi API_PREFIXES ga qo\'shing.\n');
  process.exit(1);
}

console.log(`✓ Proksi ro'yxati to'liq (${routePrefixes.size} ta marshrut prefiksi)`);
