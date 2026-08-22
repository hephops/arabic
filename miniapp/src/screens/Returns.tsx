import { useEffect, useState } from 'react';
import { api, fmt, ReturnCandidate, ReturnLookup, ReturnsInfo, Product } from '../api';
import { NavBar, EmptyState, Segmented, ProductThumb } from '../ui';
import { Glyph } from '../icons';
import Scanner from '../Scanner';
import { useHardwareScanner } from '../hardwareScanner';
import { useT } from '../i18n';
import { toast, loadFailed } from '../toast';
import { haptic } from '../telegram';
import { scanFail } from '../beep';
import { fmtWhen } from '../format';
import { ReturnsList } from './History';
import { useEscape } from '../useEscape';

// Qaytarish — bitta skanerlash bilan.
//
// Ilgari qaytarish chekni topishdan boshlanardi. Bu noto'g'ri yo'l edi:
// bitta tovar o'nlab odamga sotilgan bo'ladi, ya'ni kod bo'yicha qidirish
// o'nlab chek chiqarardi va do'konchi ular orasidan tanlab o'tirardi.
//
// Bu yerda aksincha: skanerlanadi — tovar aniqlanadi va darhol nima
// qaytayotgani, qaysi sotuvdan, qancha pul qaytishi ko'rinadi. Mijoz
// odatda yaqinda olgan tovarini qaytaradi, shuning uchun eng oxirgi
// sotuv o'zi tanlab qo'yiladi; boshqasi kerak bo'lsa bir bosishda
// almashtiriladi.

type View = 'scan' | 'list';

export default function Returns({ onBack, autoScan = false }: { onBack: () => void; autoScan?: boolean }) {
  const { t } = useT();
  const [view, setView] = useState<View>('scan');
  // Skaner faqat "+" dan kelinganda o'zi ochiladi: u yerda do'konchi
  // qo'lida tovar bilan turadi. Menyudan kirilganda esa ko'pincha
  // "nima qaytgan edi" deb qarash uchun kiriladi — kamera keraksiz.
  const [scanning, setScanning] = useState(autoScan);
  const [found, setFound] = useState<ReturnLookup | null>(null);
  const [pick, setPick] = useState<ReturnCandidate | null>(null);
  const [choosing, setChoosing] = useState(false);
  useEscape(() => setChoosing(false), choosing);
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState<'cash' | 'card' | 'debt'>('cash');
  const [busy, setBusy] = useState(false);
  // Shu seansda nima qaytarildi — do'konchi bir nechta tovarni
  // ketma-ket skanerlaganda umumiy manzarani yo'qotmasligi uchun
  const [done, setDone] = useState<{ count: number; total: number }>({ count: 0, total: 0 });
  // Oxirgi qaytarish — tasdiq sifatida ekranda qoladi
  const [last, setLast] = useState<{ name: string; qty: number; unit: string; total: number } | null>(null);
  const [list, setList] = useState<ReturnsInfo | null>(null);

  useEffect(() => {
    if (view === 'list') api.returns('month').then(setList).catch(loadFailed);
  }, [view, done.count]);

  async function lookup(code: string) {
    setScanning(false);
    setLast(null);
    try {
      const res = await api.returnLookup(code);
      if (!res.product) {
        scanFail();
        toast.error(t('returnNoProduct'), code);
        setFound(null);
        setPick(null);
        return;
      }
      if (res.candidates.length === 0) {
        scanFail();
        setFound(res);
        setPick(null);
        return;
      }
      const best = res.candidates[0];
      setFound(res);
      setPick(best);
      // Tarozi yorlig'i og'irlikni o'zi aytadi; qolganda bittadan
      const want = res.scale?.qty ? res.scale.qty : 1;
      setQty(String(Math.min(want, best.left_qty)));
      setReason('');
      setRefund(best.payment_type === 'debt' ? 'debt' : 'cash');
    } catch (e: any) {
      toast.error(t('error'), e.message);
    }
  }

  // Kompyuterga ulangan USB skaner ham shu oqimga tushadi
  useHardwareScanner((code) => {
    if (view === 'scan') lookup(code);
  });

  const num = Number((qty || '').replace(',', '.')) || 0;
  const sum = pick ? Math.round(pick.price * num) : 0;
  const tooMany = !!pick && num > pick.left_qty + 1e-9;

  async function submit() {
    if (!pick || num <= 0 || tooMany) return;
    setBusy(true);
    try {
      const res = await api.createReturn(pick.sale_id, {
        items: [{ sale_item_id: pick.sale_item_id, qty: num }],
        reason: reason.trim() || undefined,
        refund_type: refund,
      });
      haptic.success();
      toast.success(t('returnDone'), fmt(res.total));
      setDone((d) => ({ count: d.count + 1, total: d.total + res.total }));
      setLast({ name: product?.name ?? '', qty: num, unit: product?.unit ?? '', total: res.total });
      setFound(null);
      setPick(null);
      // Skaner ATAYIN o'zi ochilmaydi: tovar hali sotuvchining qo'lida
      // turadi va qayta ochilgan skaner o'sha kodni darhol qayta o'qib,
      // "qaytariladigani qolmagan" deb xato ovozi berardi. Sotuvchi
      // avval pulni beradi, keyin keyingisini skanerlaydi.
      setScanning(false);
    } catch (e: any) {
      toast.error(e.message === 'too_many' ? t('returnTooMany') : t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const product = found?.product as Product | undefined;

  return (
    <>
      <NavBar title={t('navReturns')} onBack={onBack} />
      <div className="screen narrow">
        <Segmented
          value={view}
          onChange={(v) => setView(v as View)}
          items={[
            { id: 'scan', label: t('returnScanTab'), icon: 'scan' },
            { id: 'list', label: t('historyReturns'), icon: 'clock' },
          ]}
        />

        {view === 'list' ? (
          <ReturnsList data={list} />
        ) : (
          <>
            {done.count > 0 && (
              <div className="ret-done">
                <Glyph name="check" size={16} color="var(--green)" />
                {t('returnSession')}: <b>{done.count}</b> · <b>{fmt(done.total)}</b>
              </div>
            )}

            <button className="btn-primary btn-lg" onClick={() => setScanning(true)}>
              <Glyph name="scan" size={20} color="#fff" /> {t('returnScanBtn')}
            </button>

            {/* Oxirgi qaytarish tasdig'i — nima va qancha qaytgani ko'rinib turadi */}
            {last && !pick && (
              <div className="ret-ok">
                <Glyph name="check" size={20} color="#fff" />
                <div style={{ minWidth: 0 }}>
                  <div className="ro-title">{t('returnDone')}</div>
                  <div className="ro-sub">
                    {last.name} · {last.qty} {last.unit} · {fmt(last.total)}
                  </div>
                </div>
              </div>
            )}

            {/* Tovar topildi, lekin qaytaradigan sotuv yo'q */}
            {found && !pick && (
              <EmptyState
                icon="boxes"
                title={found.product ? `${found.product.name} — ${t('returnNothingLeft')}` : t('returnNoProduct')}
                sub={t('returnNothingLeftSub')}
              />
            )}

            {product && pick && (
              <>
                {/* Nima qaytayotgani: tovar, qaysi sotuvdan, qancha pul */}
                <div className="card ret-card">
                  <div className="ret-head">
                    <ProductThumb product={product} size={54} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="ret-name">{product.name}</div>
                      <div className="ret-sub">
                        {fmtWhen(pick.created_at)}
                        {pick.customer_name ? ` · ${pick.customer_name}` : ''}
                        {' · '}
                        {fmt(pick.price)}
                      </div>
                    </div>
                  </div>

                  {/* Qaytarish mumkin bo'lgani bitta bo'lsa tanlaydigan
                      narsa yo'q — tugmalar o'rniga oddiy yozuv */}
                  {pick.left_qty <= 1 ? (
                    <div className="ret-only">
                      {pick.left_qty} {product.unit}
                    </div>
                  ) : (
                    <>
                      <div className="ret-count">
                        <button
                          className="rq-btn"
                          disabled={num <= 1}
                          onClick={() => setQty(String(Math.max(1, Math.round((num - 1) * 1000) / 1000)))}
                          aria-label="−"
                        >
                          −
                        </button>
                        <input
                          value={qty}
                          onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ''))}
                          inputMode="decimal"
                        />
                        <button
                          className="rq-btn"
                          disabled={num >= pick.left_qty}
                          onClick={() => setQty(String(Math.min(pick.left_qty, Math.round((num + 1) * 1000) / 1000)))}
                          aria-label="+"
                        >
                          +
                        </button>
                        <span className="rq-unit">{product.unit}</span>
                        {num < pick.left_qty && (
                          <button className="chip" onClick={() => setQty(String(pick.left_qty))}>
                            {t('returnAll')}
                          </button>
                        )}
                      </div>
                      <div className="ret-left">
                        {t('returnLeftMax')}: {pick.left_qty} {product.unit}
                      </div>
                    </>
                  )}

                  <div className="ret-total">
                    <span>{t('returnWillRefund')}</span>
                    <b>{fmt(sum)}</b>
                  </div>
                </div>

                {/* Ehtimol boshqa chekdan olingan — bir bosishda almashtiriladi */}
                {(found?.candidates.length ?? 0) > 1 && (
                  <button className="btn-ghost" onClick={() => setChoosing(true)}>
                    <Glyph name="clock" size={16} color="var(--accent)" /> {t('returnOtherSale')}
                  </button>
                )}

                <input placeholder={t('returnReason')} value={reason} onChange={(e) => setReason(e.target.value)} />

                <div className="section-title">{t('returnRefund')}</div>
                <div className="chip-row">
                  {(['cash', 'card', ...(pick.payment_type === 'debt' ? (['debt'] as const) : [])] as const).map((r) => (
                    <button key={r} className={`chip ${refund === r ? 'on' : ''}`} onClick={() => setRefund(r)}>
                      {r === 'cash' ? t('payCash') : r === 'card' ? t('payCard') : t('returnToDebt')}
                    </button>
                  ))}
                </div>

                <button className="btn-primary btn-lg" disabled={busy || num <= 0 || tooMany} onClick={submit}>
                  <Glyph name="arrowDown" size={19} color="#fff" />{' '}
                  {tooMany ? t('returnTooMany') : `${t('returnDo')} · ${fmt(sum)}`}
                </button>
              </>
            )}
          </>
        )}
      </div>

      {scanning && (
        <Scanner status={t('returnScanHint')} onScan={lookup} onClose={() => setScanning(false)} />
      )}

      {/* Boshqa sotuvni tanlash */}
      {choosing && found && product && (
        <div className="sheet-wrap" onClick={() => setChoosing(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-title">{t('returnOtherSale')}</div>
            <div className="sheet-sub">{t('returnOtherSaleHint')}</div>
            <div className="list-group">
              {found.candidates.map((c) => (
                <button
                  key={c.sale_item_id}
                  className={`list-item ${pick?.sale_item_id === c.sale_item_id ? 'on' : ''}`}
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => {
                    setPick(c);
                    setQty(String(Math.min(num || 1, c.left_qty)));
                    setRefund(c.payment_type === 'debt' ? 'debt' : 'cash');
                    setChoosing(false);
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="name">
                      {fmtWhen(c.created_at)}
                      {c.customer_name ? ` · ${c.customer_name}` : ''}
                    </div>
                    <div className="sub">
                      {c.left_qty} {product?.unit} · {fmt(c.price)}
                    </div>
                  </div>
                  {pick?.sale_item_id === c.sale_item_id && <Glyph name="check" size={17} color="var(--green)" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
