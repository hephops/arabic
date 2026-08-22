import { useEffect, useMemo, useRef, useState } from 'react';
import { api, BASE, type CatalogCategory, type CatalogProduct, type CatalogStats } from '../api';
import { AppIcon, Glyph } from '../icons';
import { useEscape } from '../useEscape';

// Markaziy katalog — bu yerda to'ldiriladi.
//
// Chapda bo'limlar daraxti, o'ngda o'sha bo'limdagi tovarlar. Do'konchi
// ilovada aynan shu ma'lumotni ko'radi, shuning uchun nomi va o'lchami
// bir xil yozilishi muhim.

const GLYPHS = [
  'bottle', 'milk', 'bread', 'meat', 'leaf', 'drop', 'sparkle', 'spray',
  'plug', 'shirt', 'paw', 'tool', 'heart', 'snow', 'boxes', 'house',
  'note', 'truck', 'gift', 'cart', 'card', 'star',
];
const COLORS = ['blue', 'teal', 'green', 'mint', 'orange', 'amber', 'yellow', 'purple', 'indigo', 'pink', 'red', 'gray'];
const VOLUME_UNITS = ['', 'ml', 'l', 'g', 'kg', 'dona'];
const STOCK_UNITS = ['dona', 'kg', 'litr', 'metr'];

const emptyProduct = (categoryId: number) => ({
  id: 0,
  category_id: categoryId,
  name_uz: '',
  name_ru: '',
  brand: '',
  volume_value: '' as string | number,
  volume_unit: '',
  unit: 'dona',
  barcode: '',
  status: 'verified',
});

export default function Catalog() {
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [cats, setCats] = useState<CatalogCategory[]>([]);
  const [openRoot, setOpenRoot] = useState<number | null>(null);
  const [picked, setPicked] = useState<CatalogCategory | null>(null);
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<any | null>(null);
  const [catDraft, setCatDraft] = useState<any | null>(null);
  // Escape bosilsa ochiq oyna yopilsin (yuqoridagisi birinchi)
  useEscape(() => setDraft(null), !!draft);
  useEscape(() => setCatDraft(null), !!catDraft);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imgUrl, setImgUrl] = useState('');
  const [imgMsg, setImgMsg] = useState('');
  const [bulk, setBulk] = useState('');
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCats = () => api.catCategories().then(setCats).catch(() => {});
  const loadStats = () => api.catStats().then(setStats).catch(() => {});

  function loadItems() {
    api
      .catProducts({ q, category: picked?.id, limit: 200 })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadCats();
    loadStats();
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadItems, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, picked]);

  const flat = useMemo(() => {
    const out: CatalogCategory[] = [];
    for (const r of cats) {
      out.push(r);
      for (const k of r.children ?? []) out.push(k);
    }
    return out;
  }, [cats]);

  const catName = (id: number) => flat.find((c) => c.id === id)?.name_uz ?? '—';

  /* ── Saqlash ── */

  async function saveProduct() {
    setError('');
    if (!draft.name_uz.trim()) {
      setError("Nomi kerak");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        category_id: Number(draft.category_id),
        name_uz: draft.name_uz.trim(),
        name_ru: draft.name_ru?.trim() || null,
        brand: draft.brand?.trim() || null,
        volume_value: draft.volume_value === '' ? null : Number(draft.volume_value),
        volume_unit: draft.volume_unit || null,
        unit: draft.unit,
        barcode: draft.barcode?.trim() || null,
        status: draft.status,
      };
      if (draft.image) body.image = draft.image;
      if (draft.id) await api.catUpdateProduct(draft.id, body);
      else await api.catCreateProduct(body);
      setDraft(null);
      loadItems();
      loadStats();
      loadCats();
    } catch (e: any) {
      setError(e.message === 'barcode_taken' ? 'Bu shtrix-kod boshqa tovarda bor' : e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeProduct(p: CatalogProduct) {
    if (!confirm(`"${p.name_uz}" katalogdan o'chirilsinmi?`)) return;
    await api.catDeleteProduct(p.id).catch(() => {});
    setDraft(null);
    loadItems();
    loadStats();
    loadCats();
  }

  async function saveCategory() {
    setError('');
    if (!catDraft.name_uz.trim()) {
      setError('Nomi kerak');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name_uz: catDraft.name_uz.trim(),
        name_ru: catDraft.name_ru?.trim() || catDraft.name_uz.trim(),
        glyph: catDraft.glyph,
        color: catDraft.color,
      };
      if (catDraft.id) await api.catUpdateCategory(catDraft.id, body);
      else await api.catCreateCategory({ ...body, parent_id: catDraft.parent_id ?? null });
      setCatDraft(null);
      loadCats();
      loadStats();
    } catch (e: any) {
      setError(e.message === 'too_deep' ? "Bo'lim ichida faqat bitta qavat bo'ladi" : e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(c: CatalogCategory) {
    if (!confirm(`"${c.name_uz}" bo'limi o'chirilsinmi?`)) return;
    try {
      await api.catDeleteCategory(c.id);
      if (picked?.id === c.id) setPicked(null);
      loadCats();
      loadStats();
    } catch (e: any) {
      alert(e.message === 'not_empty' ? "Bo'lim bo'sh emas — avval ichidagilarni ko'chiring" : e.message);
    }
  }

  /** Havoladan rasm — serverning o'zi yuklab oladi */
  async function loadFromUrl() {
    if (!draft?.id) {
      setImgMsg('Avval tovarni saqlang');
      return;
    }
    if (!imgUrl.trim()) return;
    setBusy(true);
    setImgMsg('');
    try {
      const p = await api.catImageFromUrl(draft.id, imgUrl.trim());
      setDraft({ ...draft, image_url: p.image_url, image: undefined });
      setImgUrl('');
      setImgMsg('Rasm qo\'yildi');
      loadItems();
      loadStats();
    } catch (e: any) {
      setImgMsg(e.details?.message ?? 'Rasmni olib bo\'lmadi');
    } finally {
      setBusy(false);
    }
  }

  /** Ochiq bazadan rasm va ma'lumot — kod bo'yicha yoki nom bo'yicha */
  async function loadFromBarcode() {
    if (!draft?.id) {
      setImgMsg('Avval tovarni saqlang');
      return;
    }
    setBusy(true);
    setImgMsg('');
    try {
      const r = await api.catFindImage(draft.id);
      setDraft({ ...r.product, image: undefined });
      setImgMsg(r.changed.length ? `Olindi: ${r.changed.join(', ')}` : 'Yangi ma\'lumot topilmadi');
      loadItems();
      loadStats();
    } catch (e: any) {
      setImgMsg(e.details?.message ?? 'Topilmadi');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Ommaviy rasm izlash.
   *
   * 448 ta tovar uchun tugmani 30 marta bosib o'tirmasin: bir marta
   * bosiladi, qolgani tugaguncha o'zi aylanadi. To'xtatish tugmasi bor —
   * ochiq baza sekin javob bersa uzoq davom etishi mumkin.
   */
  const stopRef = useRef(false);

  async function bulkImages() {
    if (running) {
      stopRef.current = true;
      return;
    }
    stopRef.current = false;
    setRunning(true);
    let total = 0;
    let none = 0;
    try {
      for (;;) {
        const r = await api.catBulkImages(15);
        total += r.done;
        none += r.missing;
        setBulk(`${total} ta rasm topildi · ${none} tasiga topilmadi · qolgani: ${r.left}`);
        loadItems();
        loadStats();
        if (stopRef.current) {
          setBulk(`To'xtatildi. ${total} ta rasm topildi, qolgani: ${r.left}`);
          break;
        }
        if (r.left === 0 || r.checked === 0) {
          // Ochiq baza asosan zavod mahsulotlarini biladi. Mahalliy non,
          // suzma, kaziga rasm topilmaydi — ularga chizma qoladi.
          setBulk(`Tugadi. ${total} ta rasm topildi, ${none} tasiga ochiq bazada rasm yo'q (ularda chizma qoladi).`);
          break;
        }
      }
    } catch (e: any) {
      setBulk(`Xato: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  function pickImage(file: File | undefined) {
    if (!file || !draft) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setDraft({ ...draft, image: canvas.toDataURL('image/jpeg', 0.85) });
    };
    img.src = URL.createObjectURL(file);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Markaziy katalog</div>
          <div className="topbar-sub">
            Do'konchi shu ro'yxatdan tovarni tanlab, o'z omboriga qo'shadi
          </div>
        </div>
        <div className="topbar-right">
          {(!!stats?.image_pending || running) && (
            <button
              className={`btn ${running ? 'danger' : ''}`}
              onClick={bulkImages}
              title="Rasmi yo'q tovarlarga ochiq bazadan rasm izlaydi (nom va hajm bo'yicha)"
            >
              <Glyph name="camera" size={16} />
              {running ? "To'xtatish" : `Rasm izlash (${stats?.image_pending ?? 0})`}
            </button>
          )}
          <button
            className="btn primary"
            onClick={() => {
              setError('');
              setImgUrl('');
              setImgMsg('');
              setDraft(emptyProduct(picked?.id ?? flat.find((c) => c.parent_id != null)?.id ?? 0));
            }}
          >
            <Glyph name="plus" size={16} /> Tovar qo'shish
          </button>
        </div>
      </div>

      {bulk && <p className="hint" style={{ marginBottom: 10 }}>{bulk}</p>}

      {stats && (
        <div className="cards">
          <div className="stat">
            <div className="label">Tovarlar</div>
            <div className="value">{stats.products}</div>
          </div>
          <div className="stat">
            <div className="label">Bo'limlar</div>
            <div className="value">{stats.categories}</div>
          </div>
          <div className="stat">
            <div className="label">Shtrix-kodli</div>
            <div className="value">{stats.with_barcode}</div>
          </div>
          <div className="stat">
            <div className="label">Rasmli</div>
            <div className="value">{stats.with_image}</div>
          </div>
          <div className="stat">
            <div className="label">Do'konlar olgan</div>
            <div className="value">{stats.used_by_shops}</div>
          </div>
        </div>
      )}

      <div className="cat-layout">
        {/* ── Bo'limlar daraxti ── */}
        <div className="panel cat-tree">
          <div className="panel-title">Bo'limlar</div>
          <button className={`ctree-row root ${!picked ? 'on' : ''}`} onClick={() => setPicked(null)}>
            <span className="ctree-name">Hammasi</span>
            <span className="ctree-count">{total}</span>
          </button>
          {cats.map((root) => (
            <div key={root.id}>
              <div className={`ctree-row root ${picked?.id === root.id ? 'on' : ''}`}>
                <button
                  className="ctree-toggle"
                  onClick={() => setOpenRoot(openRoot === root.id ? null : root.id)}
                  aria-label="Ochish"
                >
                  <Glyph name="chevron" size={13} />
                </button>
                <button className="ctree-main" onClick={() => setPicked(root)}>
                  <AppIcon glyph={root.glyph ?? 'boxes'} color={root.color ?? undefined} size={22} />
                  <span className="ctree-name">{root.name_uz}</span>
                  <span className="ctree-count">{root.product_count}</span>
                </button>
                <button
                  className="ctree-edit"
                  onClick={() => {
                    setError('');
                    setCatDraft({ ...root });
                  }}
                  aria-label="Tahrirlash"
                >
                  <Glyph name="pencil" size={13} />
                </button>
              </div>
              {openRoot === root.id && (
                <>
                  {(root.children ?? []).map((kid) => (
                    <div key={kid.id} className={`ctree-row kid ${picked?.id === kid.id ? 'on' : ''}`}>
                      <button className="ctree-main" onClick={() => setPicked(kid)}>
                        <span className="ctree-name">{kid.name_uz}</span>
                        <span className="ctree-count">{kid.product_count}</span>
                      </button>
                      <button
                        className="ctree-edit"
                        onClick={() => {
                          setError('');
                          setCatDraft({ ...kid });
                        }}
                        aria-label="Tahrirlash"
                      >
                        <Glyph name="pencil" size={13} />
                      </button>
                      <button className="ctree-edit" onClick={() => removeCategory(kid)} aria-label="O'chirish">
                        <Glyph name="trash" size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="ctree-row kid add"
                    onClick={() => {
                      setError('');
                      setCatDraft({ parent_id: root.id, name_uz: '', name_ru: '', glyph: root.glyph, color: root.color });
                    }}
                  >
                    <Glyph name="plus" size={13} /> Ichki bo'lim
                  </button>
                </>
              )}
            </div>
          ))}
          <button
            className="ctree-row root add"
            onClick={() => {
              setError('');
              setCatDraft({ parent_id: null, name_uz: '', name_ru: '', glyph: 'boxes', color: 'blue' });
            }}
          >
            <Glyph name="plus" size={13} /> Yangi bo'lim
          </button>
        </div>

        {/* ── Tovarlar ── */}
        <div className="panel">
          <div className="filters" style={{ marginBottom: 12 }}>
            <div className="f wide">
              <label>Qidirish</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nomi, brendi yoki hajmi" />
            </div>
          </div>

          {picked && (
            <div className="cat-crumb">
              <AppIcon glyph={picked.glyph ?? 'boxes'} color={picked.color ?? undefined} size={20} />
              <b>{picked.name_uz}</b>
              <button className="btn ghost sm" onClick={() => setPicked(null)}>
                Hammasi
              </button>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Nomi</th>
                  <th>Bo'lim</th>
                  <th>Hajmi</th>
                  <th>Shtrix-kod</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => {
                      setError('');
                      setImgUrl('');
                      setImgMsg('');
                      setDraft({ ...p, image: undefined });
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      {p.image_url ? (
                        <img className="cat-mini" src={`${BASE}${p.image_url}`} alt="" />
                      ) : (
                        <span className="cat-mini ph">{p.name_uz.slice(0, 2).toUpperCase()}</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-main">{p.name_uz}</div>
                      <div className="cell-sub">{[p.brand, p.name_ru].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td className="cell-sub">{p.category_uz ?? catName(p.category_id)}</td>
                    <td className="mono">
                      {p.volume_value != null && p.volume_unit ? `${p.volume_value} ${p.volume_unit}` : '—'}
                    </td>
                    <td className="mono">{p.barcode ?? '—'}</td>
                    <td>
                      {p.status === 'hidden' && <span className="badge bad">Yashirin</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <div className="empty">Tovar topilmadi</div>}
          </div>
        </div>
      </div>

      {/* ── Tovar oynasi ── */}
      {draft && (
        <div className="modal-wrap" onClick={() => setDraft(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="modal-title">{draft.id ? 'Tovarni tahrirlash' : 'Yangi tovar'}</div>
                <div className="modal-sub">Do'konchi ilovada aynan shu nomni ko'radi</div>
              </div>
              <button className="icon-btn" onClick={() => setDraft(null)} aria-label="Yopish">
                <Glyph name="close" size={16} />
              </button>
            </div>

            <div className="cat-photo-row">
              <button className="cat-photo" onClick={() => fileRef.current?.click()}>
                {draft.image ? (
                  <img src={draft.image} alt="" />
                ) : draft.image_url ? (
                  <img src={`${BASE}${draft.image_url}`} alt="" />
                ) : (
                  <Glyph name="camera" size={22} />
                )}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cell-main">Rasm</div>
                <div className="cell-sub">
                  Kompyuterdan yuklang, havola qo'ying yoki shtrix-kod bo'yicha izlating.
                  Rasm bo'lmasa ilovada tovarning shakli chiziladi.
                </div>
                <div className="cat-img-tools">
                  <input
                    value={imgUrl}
                    onChange={(e) => setImgUrl(e.target.value)}
                    placeholder="https://... rasm havolasi"
                    onKeyDown={(e) => e.key === 'Enter' && loadFromUrl()}
                  />
                  <button className="btn" onClick={loadFromUrl} disabled={busy || !imgUrl.trim()}>
                    Yuklab olish
                  </button>
                  <button
                    className="btn"
                    onClick={loadFromBarcode}
                    disabled={busy || !draft.id}
                    title="Ochiq bazadan izlash: kod bo'lsa kod bo'yicha, bo'lmasa nom va hajm bo'yicha"
                  >
                    Rasm izlash
                  </button>
                </div>
                {imgMsg && <div className="cell-sub" style={{ marginTop: 6 }}>{imgMsg}</div>}
                {draft.image_source && (
                  <div className="cell-sub" style={{ marginTop: 4 }}>
                    Manba: <span className="mono">{String(draft.image_source).slice(0, 60)}</span>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </div>

            <div className="modal-grid">
              <div className="f wide">
                <label>Nomi (o'zbekcha)</label>
                <input
                  value={draft.name_uz}
                  onChange={(e) => setDraft({ ...draft, name_uz: e.target.value })}
                  placeholder="Coca-Cola 1.5 l"
                  autoFocus
                />
              </div>
              <div className="f wide">
                <label>Nomi (ruscha)</label>
                <input
                  value={draft.name_ru ?? ''}
                  onChange={(e) => setDraft({ ...draft, name_ru: e.target.value })}
                  placeholder="Кока-Кола 1.5 л"
                />
              </div>
              <div className="f">
                <label>Brend</label>
                <input
                  value={draft.brand ?? ''}
                  onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                  placeholder="Coca-Cola"
                />
              </div>
              <div className="f">
                <label>Bo'lim</label>
                <select
                  value={draft.category_id}
                  onChange={(e) => setDraft({ ...draft, category_id: Number(e.target.value) })}
                >
                  {cats.map((root) => (
                    <optgroup key={root.id} label={root.name_uz}>
                      {(root.children ?? []).map((kid) => (
                        <option key={kid.id} value={kid.id}>
                          {kid.name_uz}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>Hajmi</label>
                <input
                  value={draft.volume_value ?? ''}
                  onChange={(e) => setDraft({ ...draft, volume_value: e.target.value.replace(',', '.') })}
                  inputMode="decimal"
                  placeholder="1.5"
                />
              </div>
              <div className="f">
                <label>O'lchov</label>
                <select
                  value={draft.volume_unit ?? ''}
                  onChange={(e) => setDraft({ ...draft, volume_unit: e.target.value })}
                >
                  {VOLUME_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u || '—'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>Sotish birligi</label>
                <select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>
                  {STOCK_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>Shtrix-kod</label>
                <input
                  className="mono"
                  value={draft.barcode ?? ''}
                  onChange={(e) => setDraft({ ...draft, barcode: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                  placeholder="Bo'sh qoldirsa ham bo'ladi"
                />
              </div>
              <div className="f">
                <label>Holati</label>
                <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="verified">Ko'rinadi</option>
                  <option value="hidden">Yashirin</option>
                </select>
              </div>
            </div>

            {error && <p className="error">{error}</p>}

            <div className="modal-actions">
              {draft.id ? (
                <button className="btn danger" onClick={() => removeProduct(draft)}>
                  O'chirish
                </button>
              ) : (
                <span />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn ghost" onClick={() => setDraft(null)}>
                  Bekor
                </button>
                <button className="btn primary" onClick={saveProduct} disabled={busy}>
                  Saqlash
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bo'lim oynasi ── */}
      {catDraft && (
        <div className="modal-wrap" onClick={() => setCatDraft(null)}>
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="modal-title">{catDraft.id ? "Bo'limni tahrirlash" : "Yangi bo'lim"}</div>
                <div className="modal-sub">
                  {catDraft.parent_id ? "Ichki bo'lim" : 'Asosiy bo\'lim'}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setCatDraft(null)} aria-label="Yopish">
                <Glyph name="close" size={16} />
              </button>
            </div>

            <div className="modal-grid">
              <div className="f wide">
                <label>Nomi (o'zbekcha)</label>
                <input
                  value={catDraft.name_uz}
                  onChange={(e) => setCatDraft({ ...catDraft, name_uz: e.target.value })}
                  placeholder="Ichimliklar"
                  autoFocus
                />
              </div>
              <div className="f wide">
                <label>Nomi (ruscha)</label>
                <input
                  value={catDraft.name_ru ?? ''}
                  onChange={(e) => setCatDraft({ ...catDraft, name_ru: e.target.value })}
                  placeholder="Напитки"
                />
              </div>
            </div>

            <div className="panel-title" style={{ marginTop: 12 }}>Ikonka</div>
            <div className="cat-pick">
              {GLYPHS.map((g) => (
                <button
                  key={g}
                  className={`cat-pick-item ${catDraft.glyph === g ? 'on' : ''}`}
                  onClick={() => setCatDraft({ ...catDraft, glyph: g })}
                >
                  <AppIcon glyph={g} color={catDraft.color ?? undefined} size={26} />
                </button>
              ))}
            </div>

            <div className="panel-title" style={{ marginTop: 12 }}>Rangi</div>
            <div className="cat-pick">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`cat-pick-item ${catDraft.color === c ? 'on' : ''}`}
                  onClick={() => setCatDraft({ ...catDraft, color: c })}
                >
                  <AppIcon glyph={catDraft.glyph ?? 'boxes'} color={c} size={26} />
                </button>
              ))}
            </div>

            {error && <p className="error">{error}</p>}

            <div className="modal-actions">
              <span />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn ghost" onClick={() => setCatDraft(null)}>
                  Bekor
                </button>
                <button className="btn primary" onClick={saveCategory} disabled={busy}>
                  Saqlash
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
