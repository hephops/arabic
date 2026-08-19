import { useEffect, useMemo, useRef, useState } from 'react';
import { api, BASE, CatalogCategory, CatalogProduct } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SubHeader, EmptyState } from '../ui';
import { useT } from '../i18n';
import { loadFailed } from '../toast';
import { unitName } from '../units';

// Markaziy katalog — do'konchi tovarni noldan yozmaydi.
//
// Bo'limlar -> ichki bo'limlar -> tovarlar. Tovarni bosgach "Omborga
// qo'shish" ochiladi: nomi, birligi va o'lchami tayyor, do'konchi faqat
// o'z narxi va miqdorini yozadi.

/** Rasmi yo'q tovar uchun bir xil ko'rinadigan plitka */
const TILE_COLORS = ['blue', 'teal', 'green', 'mint', 'orange', 'amber', 'yellow', 'purple', 'indigo', 'pink'];

/**
 * Rang brendga (yoki nomning birinchi so'ziga) qarab tanlanadi —
 * shunda Coca-Cola'ning 0.5, 1, 1.5 va 2 litrligi bir xil rangda
 * turadi va ro'yxatda bitta oila bo'lib ko'rinadi.
 */
function tileColor(p: CatalogProduct): string {
  const key = (p.brand || p.name_uz.split(/[\s-]/)[0]).toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

/** Nomdan qisqa belgi: "Coca-Cola 1.5 l" -> "CC" */
function initials(p: CatalogProduct): string {
  const source = p.brand || p.name_uz;
  const words = source
    .replace(/[0-9].*$/, '')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1);
  const letters = words.slice(0, 2).map((w) => w[0]);
  return (letters.join('') || source.slice(0, 2)).toUpperCase();
}

function ProductThumb({ p, size = 52 }: { p: CatalogProduct; size?: number }) {
  if (p.image_url) {
    return (
      <img
        className="cat-thumb"
        src={`${BASE}${p.image_url}`}
        alt=""
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div className={`cat-thumb ph c-${tileColor(p)}`} style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {initials(p)}
    </div>
  );
}

/** Tovarning o'lchami: "1.5 l" yoki "500 g" */
function volumeText(p: CatalogProduct): string {
  if (p.volume_value == null || !p.volume_unit) return '';
  const n = Math.round(p.volume_value * 100) / 100;
  return `${n} ${p.volume_unit}`;
}

export default function Catalog({
  onBack,
  onPick,
}: {
  onBack: () => void;
  /** Tovar tanlandi — kirim ekrani shu bilan ochiladi */
  onPick: (p: CatalogProduct) => void;
}) {
  const { t, lang } = useT();
  const [cats, setCats] = useState<CatalogCategory[] | null>(null);
  const [openCat, setOpenCat] = useState<CatalogCategory | null>(null);
  const [sub, setSub] = useState<number | 'all'>('all');
  const [items, setItems] = useState<CatalogProduct[] | null>(null);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const name = (c: { name_uz: string; name_ru: string }) => (lang === 'ru' ? c.name_ru : c.name_uz);
  const pName = (p: CatalogProduct) => (lang === 'ru' && p.name_ru ? p.name_ru : p.name_uz);

  useEffect(() => {
    api.catalogCategories().then(setCats).catch(loadFailed);
  }, []);

  // Qidiruv — har harfda so'rov yubormaslik uchun kutib turamiz
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2 && !openCat) {
      setItems(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(() => {
      api
        .catalogProducts({
          q: query || undefined,
          category: openCat ? (sub === 'all' ? openCat.id : sub) : undefined,
          limit: 60,
        })
        .then(setItems)
        .catch(loadFailed)
        .finally(() => setSearching(false));
    }, 260);
    return () => clearTimeout(id);
  }, [q, openCat, sub]);

  const total = useMemo(() => (cats ?? []).reduce((s, c) => s + c.product_count, 0), [cats]);

  /* ── Bo'lim ichi ── */
  if (openCat) {
    const subs = openCat.children ?? [];
    return (
      <>
        <SubHeader
          title={name(openCat)}
          onBack={() => {
            setOpenCat(null);
            setSub('all');
            setQ('');
          }}
        />
        <div className="screen wide">
          <div className="cat-search">
            <Glyph name="search" size={17} color="#8a8a8e" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('catalogSearchIn').replace('{name}', name(openCat))}
            />
            {q && (
              <button className="cat-clear" onClick={() => setQ('')} aria-label={t('cancel')}>
                <Glyph name="plus" size={15} color="#8a8a8e" />
              </button>
            )}
          </div>

          {subs.length > 0 && (
            <div className="chip-row">
              <button className={`chip ${sub === 'all' ? 'on' : ''}`} onClick={() => setSub('all')}>
                {t('all')} · {openCat.product_count}
              </button>
              {subs
                .filter((s) => s.product_count > 0)
                .map((s) => (
                  <button key={s.id} className={`chip ${sub === s.id ? 'on' : ''}`} onClick={() => setSub(s.id)}>
                    {name(s)} · {s.product_count}
                  </button>
                ))}
            </div>
          )}

          <ProductList items={items} searching={searching} onPick={onPick} pName={pName} t={t} />
        </div>
      </>
    );
  }

  /* ── Bosh ko'rinish: qidiruv va bo'limlar ── */
  return (
    <>
      <SubHeader title={t('navCatalog')} onBack={onBack} />
      <div className="screen wide">
        <div className="cat-search">
          <Glyph name="search" size={17} color="#8a8a8e" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('catalogSearchAll')}
          />
          {q && (
            <button className="cat-clear" onClick={() => setQ('')} aria-label={t('cancel')}>
              <Glyph name="plus" size={15} color="#8a8a8e" />
            </button>
          )}
        </div>

        {q.trim().length >= 2 ? (
          <ProductList items={items} searching={searching} onPick={onPick} pName={pName} t={t} />
        ) : (
          <>
            <p className="hint">{t('catalogHint').replace('{n}', String(total))}</p>
            {!cats ? null : (
              <div className="cat-grid">
                {cats
                  .filter((c) => c.product_count > 0)
                  .map((c) => (
                    <button key={c.id} className="cat-tile" onClick={() => setOpenCat(c)}>
                      <AppIcon glyph={c.glyph ?? 'boxes'} color={c.color ?? undefined} size={42} />
                      <div className="ct-name">{name(c)}</div>
                      <div className="ct-count">{c.product_count}</div>
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ───────── Tovarlar ro'yxati ───────── */

function ProductList({
  items,
  searching,
  onPick,
  pName,
  t,
}: {
  items: CatalogProduct[] | null;
  searching: boolean;
  onPick: (p: CatalogProduct) => void;
  pName: (p: CatalogProduct) => string;
  t: (k: string) => string;
}) {
  if (searching && !items) return <p className="hint">{t('loading')}</p>;
  if (!items) return null;
  if (items.length === 0) {
    return <EmptyState icon="search" title={t('catalogNothing')} sub={t('catalogNothingSub')} />;
  }
  return (
    <div className="list-group">
      {items.map((p) => (
        <div className="list-item cat-item" key={p.id} onClick={() => onPick(p)}>
          <div className="lead">
            <ProductThumb p={p} />
            <div style={{ minWidth: 0 }}>
              <div className="name">{pName(p)}</div>
              <div className="sub">
                {[p.brand, volumeText(p), unitName(p.unit)].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <button
            className="cat-add"
            onClick={(e) => {
              e.stopPropagation();
              onPick(p);
            }}
          >
            <Glyph name="plus" size={16} color="#fff" />
          </button>
        </div>
      ))}
    </div>
  );
}
