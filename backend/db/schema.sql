-- ARABIC.ONE — baza sxemasi (SQLite dev; Postgres'ga ko'chirishga mos ANSI SQL)

CREATE TABLE IF NOT EXISTS shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_name TEXT,
  address TEXT,
  language TEXT NOT NULL DEFAULT 'uz',          -- uz | uz_cyrl | ru
  card_number TEXT,                              -- asosiy karta (Humo/Uzcard)
  telegram_user_id INTEGER,
  balance INTEGER NOT NULL DEFAULT 0,            -- xizmat balansi (so'm)
  -- Xizmat qaysi kungacha to'langan. Har kuni balansdan kunlik narx
  -- yechiladi va bu sana bir kunga suriladi. Bugundan oldin bo'lsa —
  -- balans tugagan, xizmat to'xtagan.
  charged_through TEXT,
  default_reminder_mode TEXT NOT NULL DEFAULT 'soft',
  referred_by TEXT,                              -- referal kodi (ARABIC<id>)
  daily_goal INTEGER NOT NULL DEFAULT 0,         -- kunlik savdo maqsadi (0 — yo'q)
  allow_negative_stock INTEGER NOT NULL DEFAULT 0, -- qoldiqdan ko'p sotishga ruxsat
  staff_notify INTEGER NOT NULL DEFAULT 1,        -- xodim kirganda Telegram'ga xabar
  report_enabled INTEGER NOT NULL DEFAULT 1,     -- kechki avtomatik hisobot
  report_hour INTEGER NOT NULL DEFAULT 22,       -- qaysi soatda (O'zbekiston vaqti)
  last_report_date TEXT,                         -- oxirgi yuborilgan kun
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Adminlar (web-panel foydalanuvchilari)
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                   -- scrypt: salt:hash
  name TEXT,
  role TEXT NOT NULL DEFAULT 'admin',            -- admin | super
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit: qaysi admin nima qilgani
CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER REFERENCES admins(id),
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tizim sozlamalari (admin panel boshqaradi)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('min_topup_amount', '10000'),      -- balansni to'ldirishning eng kam summasi
  ('daily_price', '3300'),            -- kunlik xizmat narxi (balansdan yechiladi)
  ('trial_days', '14'),               -- yangi do'kon uchun bepul kunlar
  ('low_balance_days', '5'),          -- shuncha kun qolganda ogohlantiriladi
  ('block_on_empty', '0'),            -- balans tugasa xizmat to'xtasinmi
  ('referral_bonus', '20000'),        -- taklif qilgan do'konga bonus
  ('sms_price', '150'),               -- 1 ta SMS tannarxi
  ('call_price', '900'),              -- 1 ta AI qo'ng'iroq tannarxi
  ('support_phone', '+998 90 000 00 00'),
  ('support_telegram', '@arabicone_support'),
  -- Do'konchi balansni to'ldirish uchun pul o'tkazadigan karta
  ('topup_card', ''),
  ('topup_card_holder', ''),
  ('low_balance_notify', '1');

-- Balans harakatlari: to'ldirish va obuna yechimlari
CREATE TABLE IF NOT EXISTS balance_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  type TEXT NOT NULL,                            -- topup | daily | refund | grant | withdraw
  amount INTEGER NOT NULL,                       -- + to'ldirish, - yechim
  note TEXT,
  method TEXT,                                   -- naqd | karta | bank | payme | click | uzum
  doc_no TEXT,                                   -- hujjat/kvitansiya raqami
  payer TEXT,                                    -- to'lovchi ismi
  admin_id INTEGER,                              -- qo'lda kiritgan admin
  paid_at TEXT,                                  -- to'lov sanasi (kiritilgan)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  pin TEXT NOT NULL,                             -- 4 xonali PIN (hash prod'da)
  role TEXT NOT NULL DEFAULT 'seller',           -- owner | seller
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  phone TEXT,
  language TEXT NOT NULL DEFAULT 'uz',           -- AI qo'ng'iroq/SMS tili: uz | ru
  reminder_mode TEXT NOT NULL DEFAULT 'soft',    -- off | soft | medium | call
  telegram_user_id INTEGER,                      -- ulangan bo'lsa chek shu yerga boradi
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Qarzlar: mijoz do'konga qarzdor
CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount INTEGER NOT NULL,                       -- so'mda, butun son
  paid_amount INTEGER NOT NULL DEFAULT 0,
  note TEXT,                                     -- mahsulot/izoh
  due_date TEXT,                                 -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'active',         -- active | overdue | paid
  source TEXT NOT NULL DEFAULT 'manual',         -- manual | voice | pos | import
  sale_id INTEGER,                               -- POS'dan kelgan bo'lsa
  created_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS debt_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id INTEGER NOT NULL REFERENCES debts(id),
  amount INTEGER NOT NULL,
  created_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Postavshiklar: do'kon ta'minotchiga qarzdor ("Men qarzdorman")
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS supplier_debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  amount INTEGER NOT NULL,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Markaziy shtrix-kod katalogi (barcha do'konlar uchun umumiy)
CREATE TABLE IF NOT EXISTS barcode_catalog (
  barcode TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'dona',             -- dona | kg | litr
  created_by_shop INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Do'konning o'z mahsulotlari (ombor)
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  barcode TEXT,                                  -- NULL bo'lishi mumkin (kodsiz mahsulot)
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'dona',
  cost_price INTEGER NOT NULL DEFAULT 0,         -- kirim narxi
  sell_price INTEGER NOT NULL DEFAULT 0,         -- sotuv narxi
  stock REAL NOT NULL DEFAULT 0,                 -- qoldiq
  low_stock_threshold REAL NOT NULL DEFAULT 5,
  expiry_date TEXT,                              -- srok (ixtiyoriy), oxirgi partiya
  discount_percent INTEGER NOT NULL DEFAULT 0,   -- chegirma foizi (0-90)
  plu TEXT,                                      -- tarozi raqami (og'irlikda sotiladigan tovar)
  image_url TEXT,                                -- mahsulot rasmi (/uploads/...)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mahsulotning qo'shimcha shtrix-kodlari.
-- Bitta tovar bir necha kod bilan uchraydi (UPC-A/EAN-13, yashik kodi,
-- qadoq o'zgargani), shuning uchun kodlar alohida jadvalda saqlanadi.
CREATE TABLE IF NOT EXISTS product_barcodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (shop_id, barcode)
);
CREATE INDEX IF NOT EXISTS idx_product_barcodes ON product_barcodes (shop_id, barcode);

-- Kirim/chiqim harakatlari
-- ═══════════ MARKAZIY KATALOG ═══════════
--
-- Butun mamlakat uchun bitta tovarlar bazasi. Do'konchi tovarni noldan
-- yozmaydi — katalogdan tanlab, faqat o'z narxi va miqdorini qo'yadi.
--
-- Katalog admin panelda to'ldiriladi. Do'konning narxi, qoldig'i va
-- tannarxi bu yerga HECH QACHON yozilmaydi — u do'konning tijorat siri.

-- Bo'limlar daraxti: "Ichimliklar" -> "Gazli ichimliklar"
CREATE TABLE IF NOT EXISTS catalog_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,                             -- NULL — ildiz bo'lim
  name_uz TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  glyph TEXT,                                    -- ilovadagi ikonka nomi
  color TEXT,                                    -- ikonka rangi
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catcat_parent ON catalog_categories(parent_id, sort_order);

-- Katalog tovarlari
CREATE TABLE IF NOT EXISTS catalog_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name_uz TEXT NOT NULL,
  name_ru TEXT,
  brand TEXT,
  volume_value REAL,                             -- 1.5
  volume_unit TEXT,                              -- ml | l | g | kg | dona
  unit TEXT NOT NULL DEFAULT 'dona',             -- ombor birligi
  barcode TEXT,                                  -- bo'lishi shart emas
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'verified',       -- draft | verified | hidden
  -- Normallashtirilgan qidiruv matni: "Кока-Кола 1,5 л" ham,
  -- "coca cola 1.5l" ham shu satrga aylanadi (search.ts)
  search_key TEXT,
  created_by_admin INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catprod_cat ON catalog_products(category_id, name_uz);
CREATE INDEX IF NOT EXISTS idx_catprod_barcode ON catalog_products(barcode);
CREATE INDEX IF NOT EXISTS idx_catprod_search ON catalog_products(search_key);

-- Partiyalar: tovarning har safar kelgan to'plami.
--
-- Bitta Coca-Cola ikki marta kelishi mumkin — birinchisining srogi
-- dekabrda, ikkinchisiniki martda tugaydi. Tovarda bitta sana saqlansa
-- yangi kirim eskisini o'chirib yuborardi va eski partiya sezilmay
-- muddati o'tib ketardi.
--
-- Sotuvda eng erta tugaydigan partiyadan yechiladi.
CREATE TABLE IF NOT EXISTS product_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  -- products(id) ga FOREIGN KEY qo'yilmagan: tovar o'chirilganda
  -- partiyalar ham o'chiriladi, lekin bog'lanish o'chirishning o'zini
  -- to'sib qo'ymasligi kerak.
  product_id INTEGER NOT NULL,
  qty REAL NOT NULL,                             -- kelgan miqdor
  qty_left REAL NOT NULL,                        -- shundan qolgani
  cost_price INTEGER NOT NULL DEFAULT 0,         -- shu partiyaning kirim narxi
  expiry_date TEXT,                              -- shu partiyaning srogi
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id, qty_left);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  type TEXT NOT NULL,                            -- in | sale | writeoff | adjust
  qty REAL NOT NULL,
  expiry_date TEXT,                              -- kirimda partiya srogi (ixtiyoriy)
  created_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  total INTEGER NOT NULL,
  payment_type TEXT NOT NULL,                    -- cash | card | debt
  customer_id INTEGER REFERENCES customers(id),  -- debt bo'lsa
  created_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL,
  price INTEGER NOT NULL                          -- sotuv paytidagi narx
);

-- Eslatmalar jurnali (SMS / Telegram / AI qo'ng'iroq)
CREATE TABLE IF NOT EXISTS reminder_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  debt_id INTEGER REFERENCES debts(id),
  supplier_debt_id INTEGER REFERENCES supplier_debts(id),
  customer_id INTEGER REFERENCES customers(id),
  channel TEXT NOT NULL,                         -- sms | telegram | call
  kind TEXT,                                     -- before | due | overdue | call | after_call
  status TEXT NOT NULL DEFAULT 'queued',         -- queued | sent | delivered | answered | failed
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Qaytarish (vozvrat): mijoz tovarni qaytarib keldi.
-- Qoldiq ortga qaytadi, tushum va foyda kamayadi, qarzga olingan bo'lsa
-- qarz ham shuncha qisqaradi. Bularsiz hisobot asta-sekin haqiqatdan uzoqlashadi.
CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  sale_id INTEGER REFERENCES sales(id),
  customer_id INTEGER REFERENCES customers(id),
  total INTEGER NOT NULL,
  reason TEXT,
  refund_type TEXT NOT NULL DEFAULT 'cash',      -- cash | card | debt (qarzdan ayiriladi)
  created_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES returns(id),
  sale_item_id INTEGER REFERENCES sale_items(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL,
  price INTEGER NOT NULL                          -- sotuv paytidagi narx bilan qaytariladi
);

-- Do'kon xarajatlari: ijara, svet, ish haqi, transport...
-- Bularsiz "foyda" faqat tovar ustamasi bo'lib qoladi va haqiqatdan uzoq.
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  category TEXT NOT NULL,                        -- rent | utilities | salary | ... yoki do'konchi yozgan matn
  amount INTEGER NOT NULL,
  note TEXT,
  spent_at TEXT NOT NULL DEFAULT (date('now', '+5 hours')),  -- xarajat sanasi (kiritilgan sana emas)
  is_recurring INTEGER NOT NULL DEFAULT 0,       -- har oy takrorlanadimi (ijara, ish haqi)
  created_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_debts_shop ON debts(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_shop ON expenses(shop_id, spent_at);
CREATE INDEX IF NOT EXISTS idx_returns_shop ON returns(shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_return_items ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_debts_customer ON debts(customer_id);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(shop_id, barcode);
CREATE INDEX IF NOT EXISTS idx_sales_shop ON sales(shop_id);

-- Qarzdorning telefoni — qarzni yo'naltiruvchi kalit, shuning uchun
-- bitta do'kon ichida takrorlanmaydi (eski bo'sh yozuvlar to'sqinlik qilmaydi).
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shop_phone
  ON customers (shop_id, phone) WHERE phone IS NOT NULL AND phone <> '';

-- Telefonsiz qarz yozilmasin — bu qoida endi ilova kodida emas, bazada turadi
CREATE TRIGGER IF NOT EXISTS debts_require_phone
BEFORE INSERT ON debts
BEGIN
  SELECT RAISE(ABORT, 'customer_phone_required')
  WHERE COALESCE((SELECT phone FROM customers WHERE id = NEW.customer_id), '') = '';
END;

-- Ochiq qarzi bor mijozning raqamini bo'shatib bo'lmaydi
CREATE TRIGGER IF NOT EXISTS customers_keep_phone
BEFORE UPDATE OF phone ON customers
BEGIN
  SELECT RAISE(ABORT, 'phone_required')
  WHERE COALESCE(NEW.phone, '') = ''
    AND EXISTS (SELECT 1 FROM debts WHERE customer_id = NEW.id AND status != 'paid');
END;

-- ---------- TA'MINOTCHIGA BUYURTMA ----------
-- Kam qolgan tovarlardan tuzilgan buyurtma. Saqlanadi, chunki do'konchi
-- "o'tgan safar nima buyurtma qilgandim" deb qaytib qaraydi va bir bosishda
-- o'shani takrorlaydi.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  supplier_id INTEGER REFERENCES suppliers(id),   -- NULL = ta'minotchi belgilanmagan
  note TEXT,
  status TEXT NOT NULL DEFAULT 'draft',           -- draft | sent | received
  sent_at TEXT,
  received_at TEXT,
  created_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,          -- nomi nusxalanadi: tovar keyin o'chsa ham buyurtma o'qiladi
  unit TEXT NOT NULL DEFAULT 'dona',
  qty REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_order_items ON order_items(order_id);

-- Telegram ulanishlari: telefon raqami <-> Telegram foydalanuvchisi.
--
-- Kirish kodi SMS o'rniga shu bog'lanish orqali botga yuboriladi.
-- Alohida jadval kerak, chunki odam do'kon ochishdan OLDIN ham botga
-- ulanishi mumkin (kod olish uchun) — o'shanda hali shops yozuvi yo'q.
-- Xodimning kirishlari.
--
-- Egasi "kim, qachon ishga kirdi" ni ko'rishi kerak: smena qachon
-- boshlangani va tunda kimdir kirgan-kirmagani shu yerdan bilinadi.
-- Telegram xabari ham shu yozuvga qarab takrorlanmaydi.
-- employee_id ga FOREIGN KEY qo'yilmagan: jurnal — tarix, u xodimni
-- o'chirishga to'sqinlik qilmasligi kerak. Shuning uchun ism ham shu
-- yerda saqlanadi: xodim o'chirilsa ham "kim kirgani" yozuvda qoladi.
CREATE TABLE IF NOT EXISTS employee_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  employee_id INTEGER NOT NULL,
  employee_name TEXT,
  notified INTEGER NOT NULL DEFAULT 0,           -- Telegram'ga xabar ketdimi
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_employee_logins_shop ON employee_logins(shop_id, created_at);

CREATE TABLE IF NOT EXISTS telegram_links (
  phone TEXT PRIMARY KEY,
  telegram_user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  language TEXT,                                 -- uz | uz_cyrl | ru
  first_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tg_links_user ON telegram_links(telegram_user_id);
