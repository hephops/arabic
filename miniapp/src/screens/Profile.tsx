import { useEffect, useState } from 'react';
import { api, fmt, logout, BASE, Shop, BalanceInfo, Employee, EmployeeLogin, PermCatalog } from '../api';
import { can, isOwner, type PermKey } from '../perms';
import { AppIcon, Glyph } from '../icons';
import { SubHeader, EmptyState } from '../ui';
import { useT, LANG_NAMES, group, type Lang } from '../i18n';
import { formatCard, cardDigits, formatPhone, maskCard, formatAmount, amountValue, fmtDateTime, fmtDay, fmtWhen } from '../format';
import { toast, loadFailed } from '../toast';
import { scanSoundOn, setScanSound, beepOk, scanVibeOn, setScanVibe, vibrate } from '../beep';
import { shrink } from '../photo';
import { setShopInfo, SHOP_TYPES, PROBAS, goldPrices } from '../shopTypes';
import { useEscape } from '../useEscape';

// iOS Sozlamalar uslubidagi kabinet: asosiy ekranda qatorlar,
// har biri o'z ichki ekraniga ochiladi.

type View = 'main' | 'balance' | 'shop' | 'language' | 'employees' | 'referral' | 'report';



function Row({
  icon,
  color,
  label,
  value,
  danger,
  onClick,
}: {
  icon: string;
  color?: any;
  label: string;
  value?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="list-item" onClick={onClick}>
      <div className="lead">
        <AppIcon glyph={icon} color={color} size={29} />
        <div className="name" style={danger ? { color: 'var(--red)' } : undefined}>{label}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {value && <span className="sub" style={{ marginTop: 0 }}>{value}</span>}
        <Glyph name="chevron" size={16} color="#c7c7cc" strokeWidth={2.2} />
      </div>
    </div>
  );
}

export default function Profile({
  onLogout,
  initialView = 'main',
  isEmployee = false,
  onViewChange,
}: {
  onLogout: () => void;
  initialView?: string;
  isEmployee?: boolean;
  /** Ochilgan ichki bo'lim — App yuqoridagi panelni takrorlamasligi uchun */
  onViewChange?: (v: string) => void;
}) {
  const [view, setViewRaw] = useState<View>(initialView as View);
  const setView = (v: View) => {
    setViewRaw(v);
    onViewChange?.(v);
  };
  const [shop, setShop] = useState<Shop | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [sound, setSound] = useState(scanSoundOn());
  const [vibe, setVibe] = useState(scanVibeOn());
  const { t } = useT();

  async function load() {
    const me = await api.me();
    setShop(me);
    // Do'kon turi va gramm narxlari modul darajasidagi keshda turadi
    // (shopTypes.ts). Ilgari u FAQAT kirish paytida to'ldirilardi:
    // do'konchi sozlamalarda turni zargarlikka o'zgartirsa, kirim
    // ekrani hamon eski turda ochilardi — proba va massa maydonlari
    // chiqmasdi, birliklar eskicha qolardi. Ilovani butunlay yopib
    // ochmaguncha to'g'rilanmasdi.
    setShopInfo(me);
    // Balans va tarif — faqat do'kon egasida
    if (!me.employee) setBalance(await api.balance());
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  if (!shop || (!isEmployee && !balance)) return <div className="screen empty">{t('loading')}</div>;
  // Xodimda balans yuklanmaydi — quyida faqat ega ko'radigan joylarda ishlatiladi
  const bal = balance!;

  // ── Xodim ko'rinishi ──
  // Sozlamalar ruxsati berilgan xodim to'liq ekranni ko'radi, qolgani
  // faqat o'zini, tilni va chiqishni. Balans, xodimlar va taklif kodi
  // hech qanday ruxsat bilan ochilmaydi — ular faqat egada.
  if (isEmployee && !can('settings')) {
    if (view === 'language') return <LanguageView shop={shop} onBack={() => setView('main')} reload={load} />;
    return (
      <div className="screen">
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <AppIcon glyph="employee" color="teal" size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{shop.employee?.name}</div>
            <div className="sub">{t('employeeMode')} · {shop.name}</div>
          </div>
        </div>

        <div className="list-group" style={{ marginTop: 14 }}>
          <Row
            icon="globe"
            label={t('navLanguage')}
            value={LANG_NAMES[shop.language as Lang] ?? shop.language}
            onClick={() => setView('language')}
          />
        </div>

        <p className="hint center">{t('employeeLimited')}</p>

        <div className="list-group">
          <Row icon="logout" label={t('logoutBtn')} danger onClick={() => { logout(); onLogout(); }} />
        </div>
      </div>
    );
  }

  if (view === 'balance') return <BalanceView balance={bal} onBack={() => setView('main')} reload={load} />;
  if (view === 'shop') return <ShopView shop={shop} onBack={() => setView('main')} reload={load} />;
  if (view === 'language') return <LanguageView shop={shop} onBack={() => setView('main')} reload={load} />;
  if (view === 'employees') return <EmployeesView shop={shop} onBack={() => setView('main')} reload={load} />;
  if (view === 'referral') return <ReferralView onBack={() => setView('main')} />;
  if (view === 'report') return <ReportSettingsView shop={shop} onBack={() => setView('main')} reload={load} />;

  return (
    <div className="screen">
      {/* PROFIL SARLAVHASI — iOS'dagi Apple ID kartasi kabi */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => setView('shop')}>
        <div
          style={{
            width: 58, height: 58, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(180deg, #4da2ff, #0a66f0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 26, fontWeight: 800,
          }}
        >
          {shop.name.trim().charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{shop.name}</div>
          <div className="sub">{shop.owner_name ? `${shop.owner_name} · ` : ''}{formatPhone(shop.phone)}</div>
        </div>
        <Glyph name="chevron" size={16} color="#c7c7cc" strokeWidth={2.2} />
      </div>

      {/* Balans — bitta qator yetadi: pul va u necha kunga yetishi.
          Tarif tanlash degan narsa yo'q, shuning uchun ikkinchi qator ham yo'q.
          Xodimga ko'rsatilmaydi: do'kon puli uning ishi emas. */}
      {isOwner() && (
        <div className="list-group" style={{ marginTop: 14 }}>
          <Row
            icon="banknote"
            label={t('navBalance')}
            value={
              shop.service
                ? `${fmt(shop.service.balance)} · ${shop.service.days_left} ${t('daysShort')}`
                : fmt(shop.balance)
            }
            onClick={() => setView('balance')}
          />
        </div>
      )}

      <div className="list-group">
        <Row icon="house" label={t('shopInfo')} onClick={() => setView('shop')} />
        <Row icon="globe" label={t('navLanguage')} value={LANG_NAMES[shop.language as Lang] ?? shop.language} onClick={() => setView('language')} />
        {isOwner() && (
          <Row icon="card" label={t('cardNumber')} value={maskCard(shop.card_number) || t('notSet')} onClick={() => setView('shop')} />
        )}
      </div>

      {/* Skaner ovozi — qurilmaga bog'liq sozlama (do'konga emas):
          bittasi kassada ovoz bilan, boshqasi jim ishlashi mumkin */}
      <div className="switch-row">
        <div style={{ minWidth: 0 }}>
          <div className="sw-title">{t('scanSound')}</div>
          <div className="sw-sub">{t('scanSubSound')}</div>
        </div>
        <button
          className={`switch ${sound ? 'on' : ''}`}
          onClick={() => {
            const next = !sound;
            setScanSound(next);
            setSound(next);
            if (next) beepOk(); // yoqilganda darhol namuna
          }}
          aria-label={t('scanSound')}
        >
          <span />
        </button>
      </div>

      {/* Titrash — ovozning juftlashi. Bozorda karnay-surnay ostida
          ovoz eshitilmasligi mumkin, qo'ldagi turtki esa sezuvchan.
          iPhone Safari'da bunday imkoniyat yo'q — o'sha yerda tugma
          o'chiq turadi va sababi yozib qo'yiladi. */}
      <div className="switch-row">
        <div style={{ minWidth: 0 }}>
          <div className="sw-title">{t('scanVibe')}</div>
          <div className="sw-sub">{t('scanVibeSub')}</div>
        </div>
        <button
          className={`switch ${vibe ? 'on' : ''}`}
          onClick={() => {
            const next = !vibe;
            setScanVibe(next);
            setVibe(next);
            if (next) vibrate(1); // yoqilganda darhol namuna
          }}
          aria-label={t('scanVibe')}
        >
          <span />
        </button>
      </div>

      {/* Ombor qoidasi: qoldiqdan ko'p sotishga ruxsat.
          Odatda o'chiq — aks holda sotuvchi tasdiqlab yuborsa qoldiq
          minusga tushib, ombor hisobi buziladi. */}
      <div className="switch-row">
        <div style={{ minWidth: 0 }}>
          <div className="sw-title">{t('allowNegative')}</div>
          <div className="sw-sub">{t('allowNegativeSub')}</div>
        </div>
        <button
          className={`switch ${shop.allow_negative_stock ? 'on' : ''}`}
          onClick={async () => {
            try {
              await api.updateMe({ allow_negative_stock: shop.allow_negative_stock ? 0 : 1 });
              load();
            } catch (e: any) {
              toast.error(t('error'), e.message);
            }
          }}
          aria-label={t('allowNegative')}
        >
          <span />
        </button>
      </div>

      <div className="list-group">
        <Row
          icon="chart"
          label={t('dailyReportTitle')}
          value={shop.report_enabled ? `${String(shop.report_hour ?? 22).padStart(2, '0')}:00` : t('off')}
          onClick={() => setView('report')}
        />
      </div>

      {isOwner() && (
        <div className="list-group">
          <Row icon="employee" label={t('employees')} onClick={() => setView('employees')} />
          <Row icon="gift" label={t('inviteFriend')} onClick={() => setView('referral')} />
        </div>
      )}

      <div className="list-group">
        <Row icon="logout" label={t('logoutBtn')} danger onClick={() => { logout(); onLogout(); }} />
      </div>
    </div>
  );
}

/**
 * Balans va kunlik to'lov.
 *
 * Tarif yo'q — bitta kunlik narx bor. Do'konchi balansiga xohlagancha
 * pul tashlaydi, biz esa har kuni bir kunlik narxni yechib boramiz.
 * Shuning uchun ekranda ikkita raqam muhim: qancha pul qolgan va u
 * necha kunga yetadi. Qolgani — tarix.
 */
function BalanceView({ balance, onBack, reload }: { balance: BalanceInfo; onBack: () => void; reload: () => void }) {
  const [amount, setAmount] = useState('');
  const { t } = useT();
  const [support, setSupport] = useState<{ phone: string; telegram: string }>({ phone: '', telegram: '' });
  // Chek yuborish oynasi. null — yopiq.
  const [chek, setChek] = useState<{ amount: string; phone: string; note: string; image: string } | null>(null);
  const [sending, setSending] = useState(false);
  // Chek yuborilayotganda yopilmasin — fon bosilganda ham shunday
  useEscape(() => setChek(null), !!chek && !sending);

  async function pickPhoto(f: File | undefined) {
    if (!f) return;
    try {
      setChek((c) => (c ? { ...c, image: '' } : c));
      const img = await shrink(f);
      setChek((c) => (c ? { ...c, image: img } : c));
    } catch {
      toast.error(t('error'), t('receiptPhotoFail'));
    }
  }

  async function sendChek() {
    if (!chek) return;
    const sum = amountValue(chek.amount);
    if (sum <= 0) return toast.error(t('error'), t('receiptNeedAmount'));
    if (!chek.image) return toast.error(t('error'), t('receiptNeedPhoto'));
    setSending(true);
    try {
      const res = await api.sendPayReceipt({
        amount: sum,
        image: chek.image,
        agent_phone: chek.phone.trim() || undefined,
        note: chek.note.trim() || undefined,
      });
      setChek(null);
      // Raqam kiritilgan bo'lsa, kimga tushgani darrov aytiladi —
      // xato raqam yozilgan bo'lsa do'konchi shu yerda biladi
      toast.success(t('receiptSent'), res.agent_name ? `${t('receiptAgent')}: ${res.agent_name}` : t('receiptWait'));
      reload();
    } catch (e: any) {
      toast.error(t('error'), e.details?.message ?? e.message);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    api.support().then(setSupport).catch(() => {});
  }, []);

  // Kiritilgan summa necha kunga yetishi — hisoblagich, to'lov emas.
  // Pul faqat kartaga o'tkazish orqali tushadi.
  const typed = amountValue(amount);
  const typedDays = balance.daily_price > 0 ? Math.floor(typed / balance.daily_price) : 0;

  // Holat rangi: to'xtagan — qizil, kam qolgan — sariq, yetarli — yashil
  const tone = !balance.active ? 'red' : balance.low ? 'yellow' : 'green';

  return (
    <>
      <SubHeader title={t('navBalance')} onBack={onBack} />
      <div className="screen">
        {/* Asosiy kartochka: pul va u necha kunga yetadi */}
        <div className={`bal-hero ${tone}`}>
          <div className="bal-cap">{t('balanceNow')}</div>
          <div className="bal-sum">{fmt(balance.balance)}</div>
          <div className="bal-days">
            {/* Kunlik narx 0 bo'lsa "yana N kun" degan savolning ma'nosi
                yo'q: do'kondan pul olinmaydi, xizmat ochiq turaveradi */}
            {balance.free
              ? t('balanceFree')
              : balance.active
                ? t('balanceDaysLeft').replace('{days}', String(balance.days_left))
                : t('balanceEmpty')}
          </div>
          {balance.active && !balance.free && balance.days_left > 0 && (
            <div className="bal-until">{t('balanceUntil').replace('{date}', fmtDay(balance.runs_out_on))}</div>
          )}
        </div>

        {/* Kunlik narx — qanday hisoblanayotgani ochiq turadi */}
        <div className="list-group">
          <div className="list-item">
            <div className="lead">
              <AppIcon glyph="calendar" size={29} />
              <div>
                <div className="name">{t('dailyPrice')}</div>
                <div className="sub">{t('dailyPriceHint')}</div>
              </div>
            </div>
            <div className="amount">{fmt(balance.daily_price)}</div>
          </div>
          {balance.on_trial && (
            <div className="list-item">
              <div className="lead">
                <AppIcon glyph="gift" size={29} color="green" />
                <div>
                  <div className="name">{t('trialTitle')}</div>
                  <div className="sub">{t('trialFreeHint')}</div>
                </div>
              </div>
              <div className="amount" style={{ color: 'var(--green)' }}>
                {t('freeWord')}
              </div>
            </div>
          )}
        </div>

        {/* To'ldirish: pul kartaga o'tkaziladi.
            Ilovada "bosdim — pul tushdi" degan tugma yo'q: bu haqiqiy
            to'lov emas edi va bir necha marta bosilganda balansga
            yo'qdan pul qo'shib yuborardi. */}
        <div className="section-title">{t('topup')}</div>

        {balance.card ? (
          <div
            className="pay-card"
            onClick={() => {
              navigator.clipboard?.writeText(balance.card.replace(/\s/g, ''));
              toast.success(t('copied'));
            }}
          >
            <div>
              <div className="pc-cap">{t('topupCardTitle')}</div>
              <div className="pc-num">{formatCard(balance.card)}</div>
              {balance.card_holder && <div className="pc-holder">{balance.card_holder}</div>}
            </div>
            <Glyph name="copy" size={19} color="var(--accent)" />
          </div>
        ) : (
          <p className="hint">{t('topupNoCard')}</p>
        )}

        {/* Hisoblagich: "shuncha pul shuncha kunga yetadi" */}
        <div className="card">
          <label>{t('topupCalc')}</label>
          <input
            value={formatAmount(amount)}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            placeholder={t('topupAmount')}
          />
          <p className="hint" style={{ marginTop: 0 }}>
            {typedDays > 0
              ? t('topupCalcResult').replace('{days}', String(typedDays))
              : `${t('minAmount')}: ${fmt(balance.min_topup)}`}
          </p>
        </div>

        <p className="hint">{t('topupHowTo')}</p>

        {/* Chek yuborish.
            Payme/Click hali ulanmagan, ya'ni pul o'zi tushmaydi:
            do'konchi kartaga o'tkazadi va chekning suratini shu yerdan
            yuboradi. Admin panelda odam ko'rib tasdiqlaydi. */}
        <button className="btn-primary" onClick={() => setChek({ amount, phone: '', note: '', image: '' })}>
          <Glyph name="camera" size={17} color="#fff" /> {t('receiptSend')}
        </button>

        {support.telegram && (
          <a
            className="btn-ghost"
            href={`https://t.me/${support.telegram.replace(/^@/, '')}`}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}
          >
            <Glyph name="send" size={16} color="var(--accent)" /> {t('topupWriteUs')}
          </a>
        )}

        {balance.receipts?.length > 0 && (
          <>
            <div className="section-title">{t('receiptsTitle')}</div>
            <div className="list-group">
              {balance.receipts.map((r) => (
                <div className="list-item" key={r.id}>
                  <div className="lead">
                    {r.image_url ? (
                      <a href={`${BASE}${r.image_url}`} target="_blank" rel="noreferrer" className="chek-thumb">
                        <img src={`${BASE}${r.image_url}`} alt="" />
                      </a>
                    ) : (
                      <AppIcon glyph="banknote" size={29} />
                    )}
                    <div>
                      <div className="name">{fmt(r.amount)}</div>
                      <div className="sub">{fmtDateTime(r.created_at)}</div>
                      {r.status === 'rejected' && r.review_note && (
                        <div className="sub" style={{ color: 'var(--red)' }}>{r.review_note}</div>
                      )}
                    </div>
                  </div>
                  <span className={`badge ${r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : ''}`}>
                    {r.status === 'approved' ? t('receiptOk') : r.status === 'rejected' ? t('receiptNo') : t('receiptNew')}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {balance.transactions.length > 0 && (
          <>
            <div className="section-title">{t('history')}</div>
            <div className="list-group">
              {balance.transactions.map((tx) => (
                <div className="list-item" key={tx.id}>
                  <div>
                    <div className="name">{tx.note ?? tx.type}</div>
                    <div className="sub">{fmtDateTime(tx.created_at)}</div>
                  </div>
                  <div
                    className="amount"
                    style={{ color: tx.amount > 0 ? 'var(--green)' : tx.amount < 0 ? 'var(--red)' : 'var(--muted)' }}
                  >
                    {tx.amount > 0 ? '+' : ''}
                    {tx.amount === 0 ? '—' : fmt(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Chek yuborish oynasi */}
      {chek && (
        <div className="sheet-wrap" onClick={() => !sending && setChek(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-title">{t('receiptSend')}</div>
            <p className="sheet-sub">{t('receiptHint')}</p>

            <label className="chek-pick">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => pickPhoto(e.target.files?.[0])}
              />
              {chek.image ? (
                <img src={chek.image} alt="" className="chek-preview" />
              ) : (
                <span className="chek-empty">
                  <Glyph name="camera" size={22} color="var(--accent)" />
                  {t('receiptPhoto')}
                </span>
              )}
            </label>

            <div className="form-row">
              <label>{t('receiptAmount')}</label>
              <input
                inputMode="numeric"
                value={formatAmount(chek.amount)}
                onChange={(e) => setChek({ ...chek, amount: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="form-row">
              <label>{t('receiptAgentPhone')}</label>
              <input
                inputMode="tel"
                value={chek.phone}
                onChange={(e) => setChek({ ...chek, phone: e.target.value })}
                placeholder="+998 90 123 45 67"
              />
            </div>
            <p className="hint" style={{ marginTop: 0 }}>{t('receiptAgentHint')}</p>
            <div className="form-row">
              <label>{t('receiptNote')}</label>
              <input
                value={chek.note}
                onChange={(e) => setChek({ ...chek, note: e.target.value })}
                placeholder={t('optional')}
              />
            </div>

            <button className="btn-primary" onClick={sendChek} disabled={sending}>
              <Glyph name="send" size={16} color="#fff" /> {sending ? t('loading') : t('send')}
            </button>
            <button className="btn-ghost" onClick={() => setChek(null)} disabled={sending}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ShopView({ shop, onBack, reload }: { shop: Shop; onBack: () => void; reload: () => void }) {
  const [form, setForm] = useState({
    name: shop.name ?? '',
    owner_name: shop.owner_name ?? '',
    card_number: shop.card_number ?? '',
    address: shop.address ?? '',
  });
  const [stype, setStype] = useState<string>(shop.shop_type || 'oziq');
  // Zargarlik: har probaning 1 gramm narxi. Buyum narxi shundan
  // hisoblanadi, shuning uchun do'kon sozlamasida turadi — narx
  // o'zgarganda bitta joyni tuzatish kifoya.
  const [grams, setGrams] = useState<Record<string, string>>(() => {
    const src = goldPrices(shop);
    const out: Record<string, string> = {};
    for (const p of PROBAS) out[p] = src[p] ? String(src[p]) : '';
    for (const [k, v] of Object.entries(src)) if (!(k in out)) out[k] = String(v);
    return out;
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { t } = useT();

  async function save() {
    setError('');
    try {
      const gold: Record<string, number> = {};
      for (const [proba, v] of Object.entries(grams)) {
        const n = amountValue(v);
        if (n > 0) gold[proba] = n;
      }
      await api.updateMe({
        ...form,
        shop_type: stype,
        // Gramm narxlari faqat zargarlik do'konida ma'noga ega
        ...(stype === 'oltin' ? { gold_prices: JSON.stringify(gold) } : {}),
      });
      toast.success(t('saved'));
      reload();
    } catch (e: any) {
      setError(t('error') + ': ' + e.message);
    }
  }

  const cardLen = cardDigits(form.card_number).length;
  const cardBad = cardLen > 0 && cardLen < 16;

  return (
    <>
      <SubHeader title={t('shopInfo')} onBack={onBack} />
      <div className="screen">

      <div className="form-group">
        <div className="form-row">
          <label>{t('shopName')}</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-row">
          <label>{t('ownerName')}</label>
          <input
            value={form.owner_name}
            onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
            placeholder="Akbar aka"
          />
        </div>
        <div className="form-row">
          <label>{t('address')}</label>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Chilonzor, 5-kvartal"
          />
        </div>
      </div>

      <div className="form-group">
        <div className="form-row">
          <label>{t('setupCardShort')}</label>
          <input
            className={`mono ${cardBad ? 'bad' : ''}`}
            value={formatCard(form.card_number)}
            onChange={(e) => setForm({ ...form, card_number: formatCard(e.target.value) })}
            inputMode="numeric"
            placeholder="8600 0000 0000 0000"
          />
        </div>
        <p className="form-note">{t('setupCardHint')}</p>
      </div>

      {/* Do'kon turi — ilova ko'rinishini shu belgilaydi */}
      <div className="section-title">{t('shopTypeLabel')}</div>
      <div className="card">
        <div className="stype-grid">
          {SHOP_TYPES.map((x) => (
            <button
              key={x.id}
              className={`stype ${stype === x.id ? 'on' : ''}`}
              onClick={() => setStype(x.id)}
              type="button"
            >
              <span className="stype-emoji">{x.emoji}</span>
              <span className="stype-name">{t(`stype_${x.id}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Zargarlik: gramm narxlari. Buyum narxi massa × shu narx. */}
      {stype === 'oltin' && (
        <>
          <div className="section-title">{t('goldPriceTitle')}</div>
          <div className="card">
            {PROBAS.map((p) => (
              <div className="gram-row" key={p}>
                <span className="proba">{p}</span>
                <input
                  inputMode="numeric"
                  value={formatAmount(grams[p] ?? '')}
                  onChange={(e) => setGrams({ ...grams, [p]: e.target.value })}
                  placeholder="0"
                />
              </div>
            ))}
            <p className="hint" style={{ marginTop: 4 }}>{t('goldGramHint')}</p>
          </div>
        </>
      )}

      <div className="form-group">
        <div className="form-row">
          <label>{t('phone')}</label>
          <input value={formatPhone(shop.phone)} disabled style={{ opacity: 0.5 }} />
        </div>
      </div>

      <button className="btn-primary btn-lg" onClick={save} disabled={cardBad || !form.name.trim()}>
        <Glyph name="check" size={19} color="#fff" /> {t('save')}
      </button>
      {cardBad && <p className="error center">{t('cardInvalid')}</p>}
      {message && <p className="hint center">{message}</p>}
      {error && <p className="error center">{error}</p>}
      </div>
    </>
  );
}

function LanguageView({ shop, onBack, reload }: { shop: Shop; onBack: () => void; reload: () => void }) {
  const { t, setLang } = useT();

  async function pick(lang: string) {
    setLang(lang as Lang);
    await api.updateMe({ language: lang } as any);
    reload();
    onBack();
  }

  return (
    <>
      <SubHeader title={t('navLanguage')} onBack={onBack} />
      <div className="screen">
      <div className="list-group">
        {Object.entries(LANG_NAMES).map(([id, label]) => (
          <div className="list-item" key={id} onClick={() => pick(id)}>
            <div className="name">{label}</div>
            {shop.language === id && <Glyph name="check" size={18} color="var(--accent)" strokeWidth={2.4} />}
          </div>
        ))}
      </div>
      </div>
    </>
  );
}

function EmployeesView({ shop, onBack, reload }: { shop: Shop; onBack: () => void; reload: () => void }) {
  const shopPhone = shop.phone;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logins, setLogins] = useState<EmployeeLogin[]>([]);
  const { t } = useT();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [adding, setAdding] = useState(false);
  const [opened, setOpened] = useState<Employee | null>(null);
  const [error, setError] = useState('');
  // Yangi xodimga darhol to'plam tanlanadi — keyin kartochkasida
  // bitta-bitta to'g'rilash mumkin
  const [preset, setPreset] = useState('seller');
  const [presets, setPresets] = useState<Record<string, PermKey[]>>({});

  const load = () => {
    api.employees().then(setEmployees).catch(loadFailed);
    api.employeeLogins().then(setLogins).catch(loadFailed);
    api.permCatalog().then((c) => setPresets(c.presets)).catch(loadFailed);
  };
  useEffect(() => {
    load();
  }, []);

  async function add() {
    setError('');
    if (!name.trim() || !/^\d{4}$/.test(pin)) {
      setError(t('pinRequired'));
      return;
    }
    await api.createEmployee({ name: name.trim(), pin, permissions: presets[preset] });
    toast.success(t('toastEmployeeAdded'), name.trim());
    setName('');
    setPin('');
    setAdding(false);
    load();
  }

  // Xodim kartochkasi: PIN va kirish yo'riqnomasi shu yerda turadi,
  // ro'yxatda esa faqat ism va holat ko'rinadi.
  if (opened) {
    return (
      <EmployeeCard
        employee={opened}
        shopPhone={shopPhone}
        onBack={() => setOpened(null)}
        onChanged={async () => {
          await load();
          setOpened(null);
        }}
      />
    );
  }

  return (
    <>
      <SubHeader title={t('navEmployees')} onBack={onBack} />
      <div className="screen">
      <p className="hint">{t('employeesHint')}</p>

      {!adding ? (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <Glyph name="plus" size={18} color="#fff" /> {t('addEmployee')}
        </button>
      ) : (
        <>
          <div className="form-group">
            <div className="form-row">
              <label>{t('name')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jasur" autoFocus />
            </div>
            <div className="form-row">
              <label>{t('pinCode')}</label>
              <input
                className="mono"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
              />
            </div>
          </div>
          <div className="section-title sm">{t('permPreset')}</div>
          <div className="chip-row">
            {(
              [
                ['cashier', t('presetCashier')],
                ['seller', t('presetSeller')],
                ['senior', t('presetSenior')],
                ['manager', t('presetManager')],
              ] as [string, string][]
            ).map(([id, label]) => (
              <button key={id} className={`chip ${preset === id ? 'on' : ''}`} onClick={() => setPreset(id)}>
                {label}
              </button>
            ))}
          </div>
          <p className="hint">{t('permHint')}</p>
          <button className="btn-primary btn-lg" onClick={add}>
            <Glyph name="check" size={19} color="#fff" /> {t('save')}
          </button>
          <button className="btn-ghost" onClick={() => setAdding(false)}>{t('cancel')}</button>
          {error && <p className="error center">{error}</p>}
        </>
      )}
      {employees.length > 0 && (
        <div className="list-group" style={{ marginTop: 12 }}>
          {employees.map((e) => (
            <div className="list-item" key={e.id} onClick={() => setOpened(e)}>
              <div className="lead">
                <AppIcon glyph="employee" color={e.is_active ? 'teal' : 'gray'} size={30} />
                <div className="name">{e.name}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`badge ${e.is_active ? 'paid' : 'overdue'}`}>
                  {e.is_active ? t('employeeActive') : t('employeeBlocked')}
                </span>
                <Glyph name="chevron" size={15} color="#c7c7cc" />
              </div>
            </div>
          ))}
        </div>
      )}
      {employees.length === 0 && !adding && (
        <EmptyState icon="employee" title={t('noEmployees')} sub={t('noEmployeesSub')} />
      )}

      {employees.length > 0 && (
        <>
          {/* Egasi do'konda doim bo'lmaydi. Smena qachon boshlangani va
              tunda kimdir kirgan-kirmagani — u bilishi kerak bo'lgan narsa. */}
          <div className="switch-row" style={{ marginTop: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div className="sw-title">{t('staffNotify')}</div>
              <div className="sw-sub">{t('staffNotifySub')}</div>
            </div>
            <button
              className={`switch ${shop.staff_notify !== 0 ? 'on' : ''}`}
              onClick={async () => {
                try {
                  await api.updateMe({ staff_notify: shop.staff_notify !== 0 ? 0 : 1 });
                  reload();
                } catch (e: any) {
                  toast.error(t('error'), e.message);
                }
              }}
              aria-label={t('staffNotify')}
            >
              <span />
            </button>
          </div>

          <div className="section-title">{t('staffLogins')}</div>
          {logins.length === 0 ? (
            <p className="hint">{t('staffNoLogins')}</p>
          ) : (
            <div className="list-group">
              {logins.map((l) => (
                <div className="list-item" key={l.id}>
                  <div className="lead">
                    <AppIcon glyph="employee" color="teal" size={30} />
                    <div className="name">{l.employee_name ?? '—'}</div>
                  </div>
                  <div className="amount muted">{fmtWhen(l.created_at)}</div>
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

/* ───────── Xodim kartochkasi: PIN va kirish yo'riqnomasi ───────── */

function EmployeeCard({
  employee,
  shopPhone,
  onBack,
  onChanged,
}: {
  employee: Employee;
  shopPhone: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useT();

  return (
    <>
      <SubHeader title={employee.name} onBack={onBack} />
      <div className="screen">

      <div className="card center" style={{ padding: '20px 16px' }}>
        <AppIcon glyph="employee" color={employee.is_active ? 'teal' : 'gray'} size={54} />
        <div style={{ fontSize: 19, fontWeight: 700, marginTop: 10 }}>{employee.name}</div>
        <div className="sub">
          {(employee.permissions?.length ?? 0)} {t('permSelected')} ·{' '}
          {employee.is_active ? t('employeeActive') : t('employeeBlocked')}
        </div>
      </div>

      {employee.pin && (
        <>
          <div className="section-title">{t('employeePin')}</div>
          <div className="pin-card">
            <div className="pin-value">{shown ? employee.pin : '••••'}</div>
            <div className="pin-actions">
              <button className="chip" onClick={() => setShown(!shown)}>
                {shown ? t('hidePin') : t('showPin')}
              </button>
              <button
                className="chip"
                onClick={() => {
                  navigator.clipboard?.writeText(employee.pin!);
                  setCopied(true);
                  toast.info(t('toastCopied'), employee.pin);
                }}
              >
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="section-title">{t('employeeHowTo')}</div>
      <div className="card">
        <p className="hint" style={{ margin: 0 }}>
          {t('employeeHowToText').replace('{phone}', formatPhone(shopPhone))}
        </p>
      </div>

      <PermissionEditor employee={employee} onSaved={onChanged} />

      <button
        className={`btn-primary btn-lg ${employee.is_active ? 'danger' : ''}`}
        // Xato ushlanmasa tugma jimgina ishlamas edi: do'kon egasi
        // bosadi, hech narsa o'zgarmaydi va nima bo'lganini bilmaydi.
        onClick={async () => {
          try {
            await api.updateEmployee(employee.id, { is_active: employee.is_active ? 0 : 1 });
            onChanged();
          } catch (e: any) {
            toast.error(t('error'), e.message);
          }
        }}
      >
        {employee.is_active ? t('block') : t('unblock')}
      </button>
      <button
        className="btn-ghost danger"
        onClick={async () => {
          if (!confirm(t('employeeDeleteAsk'))) return;
          try {
            await api.deleteEmployee(employee.id);
            toast.success(t('employeeDelete'), employee.name);
            onChanged();
          } catch (e: any) {
            // Aks holda o'chirish muvaffaqiyatsiz bo'lsa ham xodim
            // ro'yxatdan yo'qolgandek ko'rinardi (keyingi ochilishda qaytardi)
            toast.error(t('error'), e.message);
          }
        }}
      >
        {t('employeeDelete')}
      </button>
      </div>
    </>
  );
}

/* ───────── Ruxsatlar: har bir xodimga alohida ───────── */

// Do'konda ikki xil odam bo'lmaydi. Biri faqat kassada turadi, biri
// tovar ham qabul qiladi, biri do'konni butunlay yuritadi. Shuning
// uchun ro'yxat katakcha bo'lib beriladi — ega o'zi belgilaydi.
//
// Tayyor to'plamlar yuqorida turadi: ko'pchilik uchun bitta bosish
// yetadi, kerak bo'lsa keyin bitta-bitta to'g'rilanadi.

function PermissionEditor({ employee, onSaved }: { employee: Employee; onSaved: () => void }) {
  const { t } = useT();
  const [cat, setCat] = useState<PermCatalog | null>(null);
  const [sel, setSel] = useState<PermKey[]>(employee.permissions ?? []);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.permCatalog().then(setCat).catch(loadFailed);
  }, []);

  if (!cat) return null;

  const has = (k: PermKey) => sel.includes(k);
  const toggle = (k: PermKey) => {
    setDirty(true);
    setSel((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };
  const applyPreset = (name: string) => {
    setDirty(true);
    setSel(cat.presets[name] ?? []);
  };

  async function save() {
    setSaving(true);
    try {
      await api.updateEmployee(employee.id, { permissions: sel });
      toast.success(t('permSaved'), employee.name);
      setDirty(false);
      onSaved();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  }

  const PRESET_LABEL: Record<string, string> = {
    cashier: t('presetCashier'),
    seller: t('presetSeller'),
    senior: t('presetSenior'),
    manager: t('presetManager'),
  };

  return (
    <>
      <div className="section-title">
        {t('permTitle')} · {sel.length} {t('permSelected')}
      </div>
      <p className="hint">{t('permHint')}</p>

      <div className="chip-row">
        {['cashier', 'seller', 'senior', 'manager'].map((name) => (
          <button key={name} className="chip" onClick={() => applyPreset(name)}>
            {PRESET_LABEL[name]}
          </button>
        ))}
      </div>

      {cat.groups.map((g) => (
        <div key={g.group}>
          <div className="section-title sm">{t('permGroup' + g.group.charAt(0).toUpperCase() + g.group.slice(1))}</div>
          <div className="list-group">
            {g.keys.map((k) => (
              <label className="list-item perm-row" key={k}>
                <div className="name">{t('perm_' + k)}</div>
                <button
                  className={`switch ${has(k) ? 'on' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    toggle(k);
                  }}
                  aria-label={t('perm_' + k)}
                  aria-pressed={has(k)}
                >
                  <span />
                </button>
              </label>
            ))}
          </div>
        </div>
      ))}

      <p className="hint">{t('permOwnerOnly')}</p>

      {dirty && (
        <button className="btn-primary btn-lg" onClick={save} disabled={saving}>
          <Glyph name="check" size={19} color="#fff" /> {t('save')}
        </button>
      )}
    </>
  );
}

function ReferralView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.referral>> | null>(null);
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.referral().then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="screen empty">{t('loading')}</div>;

  // Havola serverdan keladi: bot nomi u yerda turadi. Ilgari bu yerga
  // bot nomi qo'lda yozilgan edi va nomi o'zgargach taklif qilingan
  // odam yo'q botga tushardi.
  const link = data.link ?? '';
  const shareText = `BuySale — Savdo, ombor, foyda ilovasiga qo'shiling! Promo-kodim: ${data.code}. ${data.reward_text}.`;

  return (
    <>
      <SubHeader title={t('inviteFriend')} onBack={onBack} />
      <div className="screen">
      <div className="card center" style={{ padding: '24px 16px' }}>
        <AppIcon glyph="gift" size={52} />
        <div className="hint" style={{ marginTop: 10 }}>{t('yourPromoCode')}</div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 2 }}>{data.code}</div>
        <p className="hint">{data.reward_text}</p>
        <button
          className="btn-primary"
          onClick={() => {
            navigator.clipboard?.writeText(link ? `${shareText}\n${link}` : shareText);
            setCopied(true);
            const tg = (window as any).Telegram?.WebApp;
            if (link) {
              tg?.openTelegramLink?.(
                `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`
              );
            }
          }}
        >
          {copied ? t('copied') : t('share')}
        </button>
      </div>
      <div className="card center">
        <div className="hint">{t('invitedCount')}</div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{data.invited_count} {t('shops')}</div>
        {/* Nechta odam chaqirganidan ko'ra "qancha pul tushdi" muhimroq:
            bonus faqat chaqirilgan do'kon to'lov qilganda beriladi */}
        {(data.earned ?? 0) > 0 && (
          <div style={{ marginTop: 10, color: 'var(--green)', fontWeight: 700 }}>
            +{fmt(data.earned ?? 0)}
          </div>
        )}
      </div>
      </div>
    </>
  );
}

/* ───────── Kechki avtomatik hisobot ───────── */

// Do'konchi ilovani ochmasa ham kun yakuni Telegram'ga o'zi kelsin.
// Bu yerda uchta narsa hal qilinadi: yoqish/o'chirish, soat, va eng
// muhimi — "qanaqa xabar keladi" ni oldindan ko'rsatish.
function ReportSettingsView({ shop, onBack, reload }: { shop: Shop; onBack: () => void; reload: () => void }) {
  const { t } = useT();
  const [enabled, setEnabled] = useState(shop.report_enabled !== 0);
  const [hour, setHour] = useState(shop.report_hour ?? 22);
  const [preview, setPreview] = useState<{ text: string; telegram_linked: boolean; bot?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.dailyReportPreview().then(setPreview).catch(loadFailed);
  }, []);

  async function save(next: { enabled?: boolean; hour?: number }) {
    const e = next.enabled ?? enabled;
    const h = next.hour ?? hour;
    setEnabled(e);
    setHour(h);
    try {
      await api.updateMe({ report_enabled: e ? 1 : 0, report_hour: h });
      reload();
    } catch (err: any) {
      toast.error(t('error'), err.message);
    }
  }

  async function sendNow() {
    if (busy) return;
    setBusy(true);
    try {
      await api.sendDailyReport();
      toast.success(t('reportSentNow'));
    } catch (e: any) {
      // Sababi aniq: bot ulanmagan bo'lsa boshqa, egasi botni ochmagan
      // bo'lsa boshqa yechim kerak
      const key =
        e.message === 'no_telegram' ? 'reportNoTelegram'
        : e.message === 'telegram_disabled' ? 'reportBotOff'
        : 'error';
      toast.error(t(key));
    } finally {
      setBusy(false);
    }
  }

  const HOURS = [18, 19, 20, 21, 22, 23];

  return (
    <>
      <SubHeader title={t('dailyReportTitle')} onBack={onBack} />
      <div className="screen narrow">
        <p className="hint" style={{ marginBottom: 12 }}>{t('dailyReportHint')}</p>

        <div className="list-group">
          <div className="list-item">
            <div className="name">{t('dailyReportOn')}</div>
            <button
              className={`switch ${enabled ? 'on' : ''}`}
              onClick={() => save({ enabled: !enabled })}
              aria-label={t('dailyReportOn')}
            >
              <span />
            </button>
          </div>
        </div>

        {enabled && (
          <>
            <div className="section-title">{t('dailyReportHour')}</div>
            <div className="chip-row wrap">
              {HOURS.map((h) => (
                <button key={h} className={`chip ${hour === h ? 'on' : ''}`} onClick={() => save({ hour: h })}>
                  {String(h).padStart(2, '0')}:00
                </button>
              ))}
            </div>
          </>
        )}

        {/* Telegram ulanmagan bo'lsa — ogohlantirish emas, ochiladigan
            tugma: do'konchi bot nomini qidirib yurmasin */}
        {preview && !preview.telegram_linked && (
          <div className="trust-warn">
            <Glyph name="warning" size={17} color="var(--yellow)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{t('reportNoTelegram')}</b>
              <div className="tw-sub">{t('reportLinkHint')}</div>
              {preview.bot && (
                <a
                  className="tw-link"
                  href={`https://t.me/${preview.bot}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Glyph name="send" size={15} color="var(--accent)" /> {t('tgOpenBot')}
                </a>
              )}
            </div>
          </div>
        )}

        {preview && (
          <>
            <div className="section-title">{t('reportPreview')}</div>
            <div className="order-text">{preview.text}</div>
          </>
        )}

        <button className="btn-primary" onClick={sendNow} disabled={busy}>
          <Glyph name="send" size={17} color="#fff" /> {t('reportSendNow')}
        </button>
      </div>
    </>
  );
}
