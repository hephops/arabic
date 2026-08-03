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
  plan TEXT NOT NULL DEFAULT 'free',             -- free | premium | business
  plan_expires_at TEXT,
  balance INTEGER NOT NULL DEFAULT 0,            -- obuna balansi (so'm)
  default_reminder_mode TEXT NOT NULL DEFAULT 'soft',
  referred_by TEXT,                              -- referal kodi (ARABIC<id>)
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
  ('price_premium', '99000'),         -- Premium tarif narxi (30 kun)
  ('price_business', '199000'),       -- Biznes tarif narxi (30 kun)
  ('trial_days', '14'),               -- yangi do'kon uchun sinov muddati
  ('referral_bonus', '20000'),        -- taklif qilgan do'konga bonus
  ('sms_price', '150'),               -- 1 ta SMS tannarxi
  ('call_price', '900'),              -- 1 ta AI qo'ng'iroq tannarxi
  ('support_phone', '+998 90 000 00 00'),
  ('support_telegram', '@arabicone_support');

-- Balans harakatlari: to'ldirish va obuna yechimlari
CREATE TABLE IF NOT EXISTS balance_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  type TEXT NOT NULL,                            -- topup | subscription
  amount INTEGER NOT NULL,                       -- + to'ldirish, - yechim
  note TEXT,
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

CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_debts_shop ON debts(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_debts_customer ON debts(customer_id);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(shop_id, barcode);
CREATE INDEX IF NOT EXISTS idx_sales_shop ON sales(shop_id);
