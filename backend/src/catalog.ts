// Markaziy katalog — API.
//
// Ikki tomoni bor:
//   • do'konchi uchun — faqat o'qish: bo'limlarni ko'rish, qidirish
//   • admin uchun — to'ldirish va tahrirlash
//
// Do'kon katalogni o'zgartira olmaydi. Do'konchi tovarni katalogdan
// o'z omboriga KO'CHIRIB oladi va shundan keyin uni o'zi uchun xohlagancha
// tahrirlaydi — bu markazga ta'sir qilmaydi.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { db } from './db.js';
import { requireAdmin, log } from './admin.js';
import { normalizeSearch, productSearchKey, searchTerms } from './search.js';
import { normalizeBarcode, barcodeVariants } from './barcodes.js';
import { normalizeUnit } from './units.js';
import { fetchImage, saveFetched, offLookup, parseQuantity } from './imageFetch.js';

const VOLUME_UNITS = ['ml', 'l', 'g', 'kg', 'dona'];

/** Bo'limlar daraxti: ildizlar va ularning ichidagilari */
function categoryTree() {
  const rows = db
    .prepare('SELECT * FROM catalog_categories ORDER BY sort_order, name_uz')
    .all() as any[];
  const roots = rows.filter((r) => r.parent_id == null);
  // Har bo'limdagi tovarlar soni — bo'sh bo'limni ko'rsatmaslik uchun
  const counts = new Map<number, number>();
  for (const r of db
    .prepare(`SELECT category_id, COUNT(*) AS c FROM catalog_products WHERE status != 'hidden' GROUP BY category_id`)
    .all() as any[]) {
    counts.set(r.category_id, r.c);
  }
  return roots.map((root) => {
    const kids = rows
      .filter((r) => r.parent_id === root.id)
      .map((k) => ({ ...k, product_count: counts.get(k.id) ?? 0 }));
    return {
      ...root,
      product_count: kids.reduce((s, k) => s + k.product_count, 0) + (counts.get(root.id) ?? 0),
      children: kids,
    };
  });
}

/**
 * Tovar qidirish.
 *
 * Qidiruv kaliti bo'yicha: har bir so'z alohida tekshiriladi, shuning
 * uchun so'zlarning tartibi ahamiyatsiz — "kola 1.5" ham, "1.5 kola"
 * ham topadi.
 */
function searchProducts(opts: {
  q?: string;
  categoryId?: number;
  barcode?: string;
  limit: number;
  offset: number;
  includeHidden?: boolean;
}) {
  const where: string[] = [];
  const params: any[] = [];

  if (!opts.includeHidden) where.push("p.status != 'hidden'");

  if (opts.barcode) {
    const variants = barcodeVariants(opts.barcode);
    if (variants.length) {
      where.push(`p.barcode IN (${variants.map(() => '?').join(',')})`);
      params.push(...variants);
    }
  }

  if (opts.categoryId) {
    // Ildiz bo'lim tanlansa — ichidagilarning hammasi ham kiradi
    where.push('(p.category_id = ? OR c.parent_id = ?)');
    params.push(opts.categoryId, opts.categoryId);
  }

  for (const term of searchTerms(opts.q ?? '')) {
    where.push('p.search_key LIKE ?');
    params.push(`%${term}%`);
  }

  const sql = `
    SELECT p.*, c.name_uz AS category_uz, c.name_ru AS category_ru,
           c.glyph AS category_glyph, c.color AS category_color
    FROM catalog_products p
    JOIN catalog_categories c ON c.id = p.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.name_uz
    LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...params, opts.limit, opts.offset);
}

function saveCatalogImage(dataUrl: string, id: number, uploadsDir: string): string | null {
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!match) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const filename = `catalog-${id}.${ext}`;
  writeFileSync(join(uploadsDir, filename), Buffer.from(match[2], 'base64'));
  return `/uploads/${filename}`;
}

/** Tovar yozuvidan qidiruv kalitini qayta hisoblash */
function refreshKey(id: number) {
  const p = db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(id) as any;
  if (!p) return;
  db.prepare('UPDATE catalog_products SET search_key = ? WHERE id = ?').run(productSearchKey(p), id);
}

export function registerCatalogRoutes(
  app: FastifyInstance,
  deps: { requireAuth: any; uploadsDir: string }
) {
  const { requireAuth, uploadsDir } = deps;

  /* ═══════════ DO'KONCHI UCHUN ═══════════ */

  app.get('/catalog/categories', { preHandler: requireAuth }, async () => categoryTree());

  app.get<{ Querystring: { q?: string; category?: string; barcode?: string; limit?: string; offset?: string } }>(
    '/catalog/products',
    { preHandler: requireAuth },
    async (req) => {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      return searchProducts({
        q: req.query.q,
        categoryId: req.query.category ? Number(req.query.category) : undefined,
        barcode: req.query.barcode ? normalizeBarcode(req.query.barcode) : undefined,
        limit,
        offset,
      });
    }
  );

  app.get<{ Params: { id: string } }>('/catalog/products/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = db
      .prepare(
        `SELECT p.*, c.name_uz AS category_uz, c.name_ru AS category_ru
         FROM catalog_products p JOIN catalog_categories c ON c.id = p.category_id
         WHERE p.id = ?`
      )
      .get(req.params.id);
    if (!p) return reply.code(404).send({ error: 'not_found' });
    return p;
  });

  /* ═══════════ ADMIN UCHUN ═══════════ */

  app.get('/admin/catalog/categories', { preHandler: requireAdmin }, async () => categoryTree());

  app.post<{ Body: { parent_id?: number | null; name_uz: string; name_ru?: string; glyph?: string; color?: string; sort_order?: number } }>(
    '/admin/catalog/categories',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const nameUz = (req.body?.name_uz ?? '').trim();
      if (!nameUz) return reply.code(400).send({ error: 'name_required' });
      // Ichki bo'limning ichida yana bo'lim bo'lmaydi — daraxt ikki
      // qavatli. Uch qavat do'konchi uchun chalkash bo'ladi.
      if (req.body.parent_id) {
        const parent = db.prepare('SELECT parent_id FROM catalog_categories WHERE id = ?').get(req.body.parent_id) as any;
        if (!parent) return reply.code(400).send({ error: 'parent_not_found' });
        if (parent.parent_id != null) return reply.code(400).send({ error: 'too_deep' });
      }
      const info = db
        .prepare(
          'INSERT INTO catalog_categories (parent_id, name_uz, name_ru, glyph, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          req.body.parent_id ?? null,
          nameUz,
          (req.body.name_ru ?? '').trim() || nameUz,
          req.body.glyph ?? 'box',
          req.body.color ?? 'blue',
          req.body.sort_order ?? 100
        );
      log(req.admin!.id, 'catalog_category_create', String(info.lastInsertRowid), nameUz);
      return db.prepare('SELECT * FROM catalog_categories WHERE id = ?').get(info.lastInsertRowid);
    }
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/admin/catalog/categories/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const cat = db.prepare('SELECT * FROM catalog_categories WHERE id = ?').get(req.params.id) as any;
      if (!cat) return reply.code(404).send({ error: 'not_found' });
      for (const key of ['name_uz', 'name_ru', 'glyph', 'color', 'sort_order']) {
        if (key in req.body) {
          db.prepare(`UPDATE catalog_categories SET ${key} = ? WHERE id = ?`).run(req.body[key] as any, cat.id);
        }
      }
      log(req.admin!.id, 'catalog_category_update', String(cat.id), cat.name_uz);
      return db.prepare('SELECT * FROM catalog_categories WHERE id = ?').get(cat.id);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/admin/catalog/categories/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const cat = db.prepare('SELECT * FROM catalog_categories WHERE id = ?').get(req.params.id) as any;
      if (!cat) return reply.code(404).send({ error: 'not_found' });
      // Ichida tovar yoki ichki bo'lim bo'lsa o'chirilmaydi — do'konchi
      // ilovasida yo'q bo'limga ishora qolib ketmasin
      const kids = db.prepare('SELECT COUNT(*) AS c FROM catalog_categories WHERE parent_id = ?').get(cat.id) as any;
      const prods = db.prepare('SELECT COUNT(*) AS c FROM catalog_products WHERE category_id = ?').get(cat.id) as any;
      if (kids.c > 0 || prods.c > 0) {
        return reply.code(400).send({ error: 'not_empty', children: kids.c, products: prods.c });
      }
      db.prepare('DELETE FROM catalog_categories WHERE id = ?').run(cat.id);
      log(req.admin!.id, 'catalog_category_delete', String(cat.id), cat.name_uz);
      return { ok: true };
    }
  );

  app.get<{ Querystring: { q?: string; category?: string; limit?: string; offset?: string } }>(
    '/admin/catalog/products',
    { preHandler: requireAdmin },
    async (req) => {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const items = searchProducts({
        q: req.query.q,
        categoryId: req.query.category ? Number(req.query.category) : undefined,
        limit,
        offset,
        includeHidden: true,
      });
      const total = db.prepare('SELECT COUNT(*) AS c FROM catalog_products').get() as any;
      return { items, total: total.c };
    }
  );

  app.post<{
    Body: {
      category_id: number; name_uz: string; name_ru?: string; brand?: string;
      volume_value?: number | null; volume_unit?: string | null; unit?: string;
      barcode?: string; image?: string; status?: string;
    };
  }>('/admin/catalog/products', { preHandler: requireAdmin }, async (req, reply) => {
    const nameUz = (req.body?.name_uz ?? '').trim();
    if (!nameUz) return reply.code(400).send({ error: 'name_required' });
    const cat = db.prepare('SELECT id FROM catalog_categories WHERE id = ?').get(req.body.category_id);
    if (!cat) return reply.code(400).send({ error: 'category_required' });

    const vunit = req.body.volume_unit && VOLUME_UNITS.includes(req.body.volume_unit) ? req.body.volume_unit : null;
    const barcode = normalizeBarcode(req.body.barcode) || null;
    if (barcode) {
      const clash = db.prepare('SELECT id, name_uz FROM catalog_products WHERE barcode = ?').get(barcode) as any;
      if (clash) return reply.code(409).send({ error: 'barcode_taken', product: clash });
    }

    const row = {
      name_uz: nameUz,
      name_ru: (req.body.name_ru ?? '').trim() || null,
      brand: (req.body.brand ?? '').trim() || null,
      volume_value: vunit ? Number(req.body.volume_value) || null : null,
      volume_unit: vunit,
    };
    const info = db
      .prepare(
        `INSERT INTO catalog_products
           (category_id, name_uz, name_ru, brand, volume_value, volume_unit, unit, barcode, status, search_key, created_by_admin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.body.category_id, row.name_uz, row.name_ru, row.brand,
        row.volume_value, row.volume_unit, normalizeUnit(req.body.unit),
        barcode, req.body.status === 'hidden' ? 'hidden' : 'verified',
        productSearchKey(row), req.admin!.id
      );
    const id = Number(info.lastInsertRowid);
    if (req.body.image) {
      const url = saveCatalogImage(req.body.image, id, uploadsDir);
      if (url) db.prepare('UPDATE catalog_products SET image_url = ? WHERE id = ?').run(url, id);
    }
    log(req.admin!.id, 'catalog_product_create', String(id), nameUz);
    return db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(id);
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/admin/catalog/products/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const p = db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(req.params.id) as any;
      if (!p) return reply.code(404).send({ error: 'not_found' });

      for (const key of ['category_id', 'name_uz', 'name_ru', 'brand', 'volume_value', 'volume_unit', 'unit', 'barcode', 'status']) {
        if (!(key in req.body)) continue;
        let value: any = req.body[key];
        if (key === 'unit') value = normalizeUnit(value);
        if (key === 'volume_unit') value = value && VOLUME_UNITS.includes(value) ? value : null;
        if (key === 'barcode') {
          value = normalizeBarcode(value as string) || null;
          if (value) {
            const clash = db
              .prepare('SELECT id, name_uz FROM catalog_products WHERE barcode = ? AND id != ?')
              .get(value, p.id) as any;
            if (clash) return reply.code(409).send({ error: 'barcode_taken', product: clash });
          }
        }
        if (key === 'status' && !['verified', 'draft', 'hidden'].includes(String(value))) continue;
        db.prepare(`UPDATE catalog_products SET ${key} = ? WHERE id = ?`).run(value, p.id);
      }
      if (typeof req.body.image === 'string') {
        const url = saveCatalogImage(req.body.image as string, p.id, uploadsDir);
        if (url) db.prepare('UPDATE catalog_products SET image_url = ? WHERE id = ?').run(url, p.id);
      }
      refreshKey(p.id);
      log(req.admin!.id, 'catalog_product_update', String(p.id), p.name_uz);
      return db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(p.id);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/admin/catalog/products/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const p = db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(req.params.id) as any;
      if (!p) return reply.code(404).send({ error: 'not_found' });
      // Do'konlarga ko'chirilgan nusxalar tegilmaydi — ular endi
      // do'konning o'z tovari, katalogdan mustaqil
      db.prepare('UPDATE products SET catalog_id = NULL WHERE catalog_id = ?').run(p.id);
      db.prepare('DELETE FROM catalog_products WHERE id = ?').run(p.id);
      log(req.admin!.id, 'catalog_product_delete', String(p.id), p.name_uz);
      return { ok: true };
    }
  );

  /* ── Rasm olib kelish ── */

  /** Xato sababini foydalanuvchi tushunadigan qilib qaytaramiz */
  const IMAGE_ERRORS: Record<string, string> = {
    bad_protocol: 'Havola http yoki https bilan boshlanishi kerak',
    private_host: 'Bu manzilga ruxsat yo\'q',
    not_an_image: 'Havolada rasm yo\'q (jpg, png yoki webp bo\'lishi kerak)',
    too_big: 'Rasm juda katta (4 MB dan oshmasin)',
    too_many_redirects: 'Havola aylanib qolgan',
  };

  function imageError(e: any): string {
    const key = String(e?.message ?? '');
    return IMAGE_ERRORS[key] ?? (key.startsWith('http_') ? `Sayt javob bermadi (${key.slice(5)})` : 'Rasmni olib bo\'lmadi');
  }

  /**
   * Havoladan rasm olish.
   *
   * Serverdan yuklab olinadi, admin brauzeridan emas — shunda
   * do'kon rasmni o'z serveridan oladi va tashqi saytga bog'lanib
   * qolmaydi (u sayt ertaga o'chib ketishi mumkin).
   */
  app.post<{ Params: { id: string }; Body: { url?: string } }>(
    '/admin/catalog/products/:id/image-url',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const p = db.prepare('SELECT id, name_uz FROM catalog_products WHERE id = ?').get(req.params.id) as any;
      if (!p) return reply.code(404).send({ error: 'not_found' });
      const url = (req.body?.url ?? '').trim();
      if (!url) return reply.code(400).send({ error: 'url_required', message: 'Havola kerak' });
      try {
        const img = await fetchImage(url);
        const saved = saveFetched(img, p.id, uploadsDir);
        db.prepare('UPDATE catalog_products SET image_url = ?, image_source = ? WHERE id = ?').run(saved, url, p.id);
        log(req.admin!.id, 'catalog_image_url', String(p.id), p.name_uz);
        return db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(p.id);
      } catch (e: any) {
        return reply.code(400).send({ error: 'fetch_failed', message: imageError(e) });
      }
    }
  );

  /**
   * Shtrix-kod bo'yicha zavod ma'lumotini olish (Open Food Facts).
   * Rasm, to'liq nom, brend va hajm bir so'rovda keladi.
   */
  app.post<{ Params: { id: string }; Body: { apply_name?: boolean } }>(
    '/admin/catalog/products/:id/from-barcode',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const p = db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(req.params.id) as any;
      if (!p) return reply.code(404).send({ error: 'not_found' });
      if (!p.barcode) {
        return reply.code(400).send({ error: 'no_barcode', message: 'Avval shtrix-kodni yozing' });
      }
      const off = await offLookup(p.barcode);
      if (!off) {
        return reply.code(404).send({ error: 'not_found_in_base', message: 'Bu kod ochiq bazada topilmadi' });
      }

      const changed: string[] = [];
      if (off.image) {
        try {
          const img = await fetchImage(off.image);
          const saved = saveFetched(img, p.id, uploadsDir);
          db.prepare('UPDATE catalog_products SET image_url = ?, image_source = ? WHERE id = ?').run(saved, off.image, p.id);
          changed.push('rasm');
        } catch {
          /* rasm bo'lmasa ham qolgan ma'lumot foydali */
        }
      }
      // Nom faqat so'ralganda almashadi — admin yozgan o'zbekcha nom
      // ochiq bazadagi ruscha nomdan ko'ra to'g'riroq bo'lishi mumkin
      if (req.body?.apply_name && off.name) {
        db.prepare('UPDATE catalog_products SET name_ru = ? WHERE id = ?').run(off.name, p.id);
        changed.push('nomi');
      }
      if (off.brand && !p.brand) {
        db.prepare('UPDATE catalog_products SET brand = ? WHERE id = ?').run(off.brand, p.id);
        changed.push('brend');
      }
      const q = parseQuantity(off.quantity);
      if (q && p.volume_value == null) {
        db.prepare('UPDATE catalog_products SET volume_value = ?, volume_unit = ? WHERE id = ?').run(q.value, q.unit, p.id);
        changed.push('hajmi');
      }
      refreshKey(p.id);
      log(req.admin!.id, 'catalog_from_barcode', String(p.id), p.name_uz);
      return { found: off, changed, product: db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(p.id) };
    }
  );

  /**
   * Ommaviy: shtrix-kodi bor, lekin rasmi yo'q tovarlarga rasm izlash.
   * Ketma-ket yuriladi — ochiq bazani so'rovga ko'mib tashlamaslik uchun.
   */
  app.post<{ Body: { limit?: number } }>(
    '/admin/catalog/fetch-images',
    { preHandler: requireAdmin },
    async (req) => {
      const limit = Math.min(200, Math.max(1, Number(req.body?.limit) || 25));
      const rows = db
        .prepare(
          `SELECT id, barcode FROM catalog_products
           WHERE barcode IS NOT NULL AND image_url IS NULL AND status != 'hidden'
           ORDER BY id LIMIT ?`
        )
        .all(limit) as any[];

      let done = 0;
      let missing = 0;
      for (const row of rows) {
        const off = await offLookup(row.barcode);
        if (!off?.image) {
          missing++;
          continue;
        }
        try {
          const img = await fetchImage(off.image);
          const saved = saveFetched(img, row.id, uploadsDir);
          db.prepare('UPDATE catalog_products SET image_url = ?, image_source = ? WHERE id = ?').run(saved, off.image, row.id);
          done++;
        } catch {
          missing++;
        }
      }
      const left = db
        .prepare(`SELECT COUNT(*) AS c FROM catalog_products WHERE barcode IS NOT NULL AND image_url IS NULL AND status != 'hidden'`)
        .get() as any;
      log(req.admin!.id, 'catalog_bulk_images', undefined, `${done} ta rasm`);
      return { checked: rows.length, done, missing, left: left.c };
    }
  );

  /** Katalogning umumiy holati — admin panelidagi sarlavha uchun */
  app.get('/admin/catalog/stats', { preHandler: requireAdmin }, async () => {
    const products = db.prepare('SELECT COUNT(*) AS c FROM catalog_products').get() as any;
    const withImage = db.prepare('SELECT COUNT(*) AS c FROM catalog_products WHERE image_url IS NOT NULL').get() as any;
    const withBarcode = db.prepare('SELECT COUNT(*) AS c FROM catalog_products WHERE barcode IS NOT NULL').get() as any;
    const cats = db.prepare('SELECT COUNT(*) AS c FROM catalog_categories').get() as any;
    const used = db.prepare('SELECT COUNT(DISTINCT catalog_id) AS c FROM products WHERE catalog_id IS NOT NULL').get() as any;
    const pending = db
      .prepare(`SELECT COUNT(*) AS c FROM catalog_products WHERE barcode IS NOT NULL AND image_url IS NULL AND status != 'hidden'`)
      .get() as any;
    return {
      products: products.c,
      categories: cats.c,
      with_image: withImage.c,
      with_barcode: withBarcode.c,
      used_by_shops: used.c,
      image_pending: pending.c,
    };
  });
}

export { normalizeSearch };
