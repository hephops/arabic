import { useEffect, useMemo, useState } from 'react';
import { api, fmt, Order, OrderSuggestion, Shop, Supplier } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SubHeader, Summary, EmptyState, Segmented } from '../ui';
import { useT } from '../i18n';
import { toast, loadFailed } from '../toast';
import { tg } from '../telegram';
import { PrintSheet, OrderPrint, type OrderSheetLine } from '../print';

// "Ta'minotchiga buyurtma" — kam qolgan tovarlardan tayyor ro'yxat.
//
// Do'konchi "nima tugadi" ni o'zi ham biladi; unga kerak bo'lgani —
// har safar qo'lda yozib o'tirmasdan, bir bosishda tayyor matn olish va
// uni ta'minotchiga jo'natish. Shuning uchun bu ekranning yakuniy
// mahsuloti — nusxa olinadigan/jo'natiladigan MATN.

type Tab = 'new' | 'history';

/** Ro'yxatdagi bitta satrning tahrirlanadigan holati */
interface Line {
  product_id: number;
  name: string;
  unit: string;
  qty: number;
  on: boolean;
}

const NO_SUPPLIER = -1;

export default function Orders({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('new');
  const [suggest, setSuggest] = useState<OrderSuggestion[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [lines, setLines] = useState<Record<number, Line>>({});
  const [group, setGroup] = useState<number | 'all'>('all');
  const [shop, setShop] = useState<Shop | null>(null);
  const [openOrder, setOpenOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  // Chop etish (PDF): qaysi satrlar va kimga
  const [printing, setPrinting] = useState<{ lines: OrderSheetLine[]; supplier: string | null; date: string } | null>(null);
  const { t } = useT();

  const loadSuggest = () =>
    api
      .orderSuggest()
      .then((rows) => {
        setSuggest(rows);
        // Taklif qilingan miqdorlar boshlang'ich holat bo'ladi — do'konchi
        // faqat o'zgartirmoqchi bo'lganini tuzatadi
        setLines((prev) => {
          const next: Record<number, Line> = {};
          for (const r of rows) {
            next[r.id] = prev[r.id] ?? {
              product_id: r.id,
              name: r.name,
              unit: r.unit,
              qty: r.suggest_qty,
              on: true,
            };
          }
          return next;
        });
      })
      .catch(loadFailed);

  const loadOrders = () => api.orders().then(setOrders).catch(loadFailed);

  useEffect(() => {
    loadSuggest();
    loadOrders();
    api.suppliers().then(setSuppliers).catch(() => {});
    api.me().then(setShop).catch(() => {});
  }, []);

  /* ── Ta'minotchi bo'yicha guruhlar ── */

  const groups = useMemo(() => {
    if (!suggest) return [];
    const map = new Map<number, { id: number; name: string; count: number }>();
    for (const r of suggest) {
      const id = r.supplier_id ?? NO_SUPPLIER;
      const name = r.supplier_name ?? t('noSupplierGroup');
      const g = map.get(id) ?? { id, name, count: 0 };
      g.count++;
      map.set(id, g);
    }
    // "Belgilanmagan" doim oxirida tursin
    return [...map.values()].sort((a, b) => (a.id === NO_SUPPLIER ? 1 : b.id === NO_SUPPLIER ? -1 : a.name.localeCompare(b.name)));
  }, [suggest, t]);

  const visible = useMemo(
    () => (suggest ?? []).filter((r) => group === 'all' || (r.supplier_id ?? NO_SUPPLIER) === group),
    [suggest, group]
  );

  const chosen = visible.map((r) => lines[r.id]).filter((l) => l?.on && l.qty > 0);
  const estCost = visible.reduce((s, r) => {
    const l = lines[r.id];
    return l?.on ? s + r.cost_price * l.qty : s;
  }, 0);

  /* ── Buyurtma matni ── */

  const orderText = useMemo(() => {
    if (chosen.length === 0) return '';
    const head = t('orderGreeting');
    const body = chosen.map((l, i) => `${i + 1}. ${l.name} — ${trimNum(l.qty)} ${l.unit}`);
    const tail = [shop?.name, shop?.phone].filter(Boolean).join(', ');
    return [head, '', ...body, '', tail ? `— ${tail}` : ''].filter((s, i, a) => !(s === '' && a[i - 1] === '')).join('\n').trim();
  }, [chosen, shop, t]);

  function setQty(id: number, qty: number) {
    setLines((p) => ({ ...p, [id]: { ...p[id], qty: Math.max(0, Math.round(qty * 100) / 100) } }));
  }
  function toggle(id: number) {
    setLines((p) => ({ ...p, [id]: { ...p[id], on: !p[id].on } }));
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('copied'));
    } catch {
      // HTTPS bo'lmagan yoki eski brauzerlar uchun zaxira yo'l
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast.success(t('copied'));
      } catch {
        toast.error(t('copyFailed'), t('copyFailedSub'));
      }
      ta.remove();
    }
  }

  /** Telegram'da "kimga yuborish" oynasini ochadi — ta'minotchi ro'yxatdan tanlanadi */
  function shareTelegram(text: string) {
    const url = `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  }

  function shareSms(text: string, phone?: string | null) {
    // Android ";" ni, iOS "&" ni tushunadi — ikkalasida ham ishlaydigan shakl
    window.location.href = `sms:${phone ?? ''}?&body=${encodeURIComponent(text)}`;
  }

  async function save(status: 'draft' | 'sent') {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    try {
      const created = await api.createOrder({
        supplier_id: group === 'all' || group === NO_SUPPLIER ? null : group,
        items: chosen.map((l) => ({ product_id: l.product_id, name: l.name, unit: l.unit, qty: l.qty })),
      });
      if (status === 'sent') await api.updateOrder(created.id, { status: 'sent' });
      toast.success(t('orderSaved'), `${chosen.length} ${t('itemsShort')}`);
      loadOrders();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  async function markReceived(o: Order) {
    try {
      await api.updateOrder(o.id, { status: 'received' });
      toast.success(t('orderReceived'));
      setOpenOrder(null);
      loadOrders();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    }
  }

  async function removeOrder(o: Order) {
    try {
      await api.deleteOrder(o.id);
      setOpenOrder(null);
      loadOrders();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    }
  }

  /* ── Saqlangan buyurtma kartochkasi ── */

  // Chop etish varag'i — kartochkada ham, yangi buyurtmada ham ishlaydi
  const printSheet = printing ? (
    <PrintSheet onDone={() => setPrinting(null)}>
      <OrderPrint lines={printing.lines} supplier={printing.supplier} shop={shop} date={printing.date} t={t} />
    </PrintSheet>
  ) : null;

  if (openOrder) {
    const text = orderTextOf(openOrder, shop, t);
    return (
      <>
        {printSheet}
        <SubHeader title={openOrder.supplier_name ?? t('navOrders')} onBack={() => setOpenOrder(null)} />
        <div className="screen">
          <Summary
            icon="truck"
            label={t('orderDate')}
            value={openOrder.created_at.slice(0, 16).replace('T', ' ')}
            right={<span className={`badge ${badgeClass(openOrder.status)}`}>{statusLabel(openOrder.status, t)}</span>}
          />
          <div className="list-group">
            {openOrder.items.map((i) => (
              <div className="list-item" key={i.id}>
                <div className="name">{i.name}</div>
                <div className="amount">
                  {trimNum(i.qty)} {i.unit}
                </div>
              </div>
            ))}
          </div>

          <div className="order-text">{text}</div>

          <div className="order-actions">
            <button className="btn-chip" onClick={() => copy(text)}>
              <Glyph name="copy" size={16} color="var(--accent)" /> {t('copy')}
            </button>
            <button className="btn-chip" onClick={() => shareTelegram(text)}>
              <Glyph name="send" size={16} color="var(--accent)" /> Telegram
            </button>
            {openOrder.supplier_phone && (
              <button className="btn-chip" onClick={() => shareSms(text, openOrder.supplier_phone)}>
                <Glyph name="call" size={16} color="var(--accent)" /> SMS
              </button>
            )}
          </div>

          {/* Qog'ozda beriladigan yoki PDF qilib saqlanadigan varaq */}
          <button
            className="btn-ghost"
            onClick={() =>
              setPrinting({
                lines: openOrder.items.map((i) => ({ name: i.name, qty: i.qty, unit: i.unit })),
                supplier: openOrder.supplier_name,
                date: openOrder.created_at.slice(0, 10),
              })
            }
          >
            <Glyph name="note" size={16} color="var(--accent)" /> {t('orderPrint')}
          </button>

          {openOrder.status !== 'received' && (
            <button className="btn-primary" onClick={() => markReceived(openOrder)}>
              <Glyph name="check" size={18} color="#fff" /> {t('markReceived')}
            </button>
          )}
          <button className="btn-ghost danger" onClick={() => removeOrder(openOrder)}>
            {t('delete')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {printSheet}
      <SubHeader title={t('navOrders')} onBack={onBack} />
      <div className="screen">
        <Segmented
          value={tab}
          onChange={setTab}
          items={[
            { id: 'new' as Tab, label: t('orderNew'), icon: 'plus' },
            { id: 'history' as Tab, label: t('orderHistory'), icon: 'clock' },
          ]}
        />

        {tab === 'new' && (
          <>
            {suggest === null ? (
              <div className="empty">{t('loading')}</div>
            ) : suggest.length === 0 ? (
              <EmptyState icon="boxes" title={t('orderNothingLow')} sub={t('orderNothingLowSub')} />
            ) : (
              <>
                <div className="order-hero">
                  <div className="oh-top">
                    <div>
                      <div className="oh-label">{t('orderToBuy')}</div>
                      <div className="oh-value">
                        {chosen.length} <span>{t('itemsShort')}</span>
                      </div>
                    </div>
                    <AppIcon glyph="truck" size={42} />
                  </div>
                  <div className="oh-sub">
                    {t('orderEstCost')}: <b>{fmt(estCost)}</b>
                  </div>
                </div>

                {groups.length > 1 && (
                  <div className="chip-row">
                    <button className={`chip ${group === 'all' ? 'on' : ''}`} onClick={() => setGroup('all')}>
                      {t('all')} · {suggest.length}
                    </button>
                    {groups.map((g) => (
                      <button key={g.id} className={`chip ${group === g.id ? 'on' : ''}`} onClick={() => setGroup(g.id)}>
                        {g.name} · {g.count}
                      </button>
                    ))}
                  </div>
                )}

                <div className="list-group">
                  {visible.map((r) => {
                    const l = lines[r.id];
                    if (!l) return null;
                    return (
                      <div className={`order-line ${l.on ? '' : 'off'}`} key={r.id}>
                        <button className={`ol-check ${l.on ? 'on' : ''}`} onClick={() => toggle(r.id)} aria-label={r.name}>
                          {l.on && <Glyph name="check" size={14} color="#fff" />}
                        </button>
                        <div className="ol-body" onClick={() => toggle(r.id)}>
                          <div className="ol-name">{r.name}</div>
                          <div className="ol-sub">
                            <span className={r.stock <= 0 ? 'danger' : 'warn'}>
                              {t('leftShort')}: {trimNum(r.stock)} {r.unit}
                            </span>
                            {r.sold30 > 0 && (
                              <>
                                {' · '}
                                {t('sold30')}: {trimNum(r.sold30)}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="ol-qty">
                          <button onClick={() => setQty(r.id, l.qty - 1)} disabled={!l.on}>
                            −
                          </button>
                          <input
                            value={trimNum(l.qty)}
                            onChange={(e) => setQty(r.id, parseFloat(e.target.value.replace(',', '.')) || 0)}
                            inputMode="decimal"
                            disabled={!l.on}
                          />
                          <button onClick={() => setQty(r.id, l.qty + 1)} disabled={!l.on}>
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {chosen.length > 0 && (
                  <>
                    <div className="section-title">{t('orderTextTitle')}</div>
                    <div className="order-text">{orderText}</div>

                    <div className="order-actions">
                      <button className="btn-chip" onClick={() => copy(orderText)}>
                        <Glyph name="copy" size={16} color="var(--accent)" /> {t('copy')}
                      </button>
                      <button className="btn-chip" onClick={() => shareTelegram(orderText)}>
                        <Glyph name="send" size={16} color="var(--accent)" /> Telegram
                      </button>
                      <button className="btn-chip" onClick={() => shareSms(orderText, supplierPhone(suppliers, group))}>
                        <Glyph name="call" size={16} color="var(--accent)" /> SMS
                      </button>
                    </div>

                    {/* Qog'ozda beriladigan yoki PDF qilib saqlanadigan varaq */}
                    <button
                      className="btn-ghost"
                      onClick={() =>
                        setPrinting({
                          lines: chosen.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit })),
                          supplier: groups.find((g) => g.id === group)?.name ?? null,
                          date: new Date().toISOString().slice(0, 10),
                        })
                      }
                    >
                      <Glyph name="note" size={16} color="var(--accent)" /> {t('orderPrint')}
                    </button>

                    <button className="btn-primary btn-lg" onClick={() => save('sent')} disabled={busy}>
                      <Glyph name="check" size={19} color="#fff" /> {t('orderSaveSent')}
                    </button>
                    <button className="btn-ghost" onClick={() => save('draft')} disabled={busy}>
                      {t('orderSaveDraft')}
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )}

        {tab === 'history' && (
          <>
            {orders.length === 0 ? (
              <EmptyState icon="clock" title={t('orderNoHistory')} sub={t('orderNoHistorySub')} />
            ) : (
              <div className="list-group">
                {orders.map((o) => (
                  <div className="list-item" key={o.id} onClick={() => setOpenOrder(o)}>
                    <div className="lead">
                      <AppIcon glyph="truck" size={30} />
                      <div style={{ minWidth: 0 }}>
                        <div className="name">
                          {o.supplier_name ?? t('noSupplierGroup')}
                          <span className={`badge ${badgeClass(o.status)}`}>{statusLabel(o.status, t)}</span>
                        </div>
                        <div className="sub">
                          {o.created_at.slice(0, 16).replace('T', ' ')} · {o.items.length} {t('itemsShort')}
                        </div>
                      </div>
                    </div>
                    <Glyph name="chevron" size={15} color="#c7c7cc" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ── Yordamchilar ── */

/** 3.0 -> "3", 2.50 -> "2.5" — do'konchi ortiqcha nolni ko'rmasin */
function trimNum(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function supplierPhone(suppliers: Supplier[], group: number | 'all'): string | null {
  if (group === 'all' || group === NO_SUPPLIER) return null;
  return suppliers.find((s) => s.id === group)?.phone ?? null;
}

function badgeClass(status: string): string {
  return status === 'received' ? 'paid' : status === 'sent' ? 'active' : '';
}

function statusLabel(status: string, t: (k: string) => string): string {
  return status === 'received' ? t('orderStatusReceived') : status === 'sent' ? t('orderStatusSent') : t('orderStatusDraft');
}

function orderTextOf(o: Order, shop: Shop | null, t: (k: string) => string): string {
  const body = o.items.map((i, n) => `${n + 1}. ${i.name} — ${trimNum(i.qty)} ${i.unit}`);
  const tail = [shop?.name, shop?.phone].filter(Boolean).join(', ');
  return [t('orderGreeting'), '', ...body, '', tail ? `— ${tail}` : ''].join('\n').trim();
}
