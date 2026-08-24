import { useEffect, useState } from 'react';
import {
  api, fmt, fmtNum, fmtPhone,
  type Agent, type Shop, type ShopActivity, type ShopDetail, type ShopsSummary, fmtWhen, fmtWhenDay } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SHOP_TYPE_LABEL } from '../shopTypes';
import { useEscape } from '../useEscape';


const PAGE_SIZES = [10, 25, 50, 100];

/** Do'kon holati — kunlik to'lov bo'yicha */
function shopState(s: { is_blocked: number; charged_through: string | null }, today: string) {
  if (s.is_blocked) return { cls: 'bad', text: 'Bloklangan' };
  if (!s.charged_through || s.charged_through < today) return { cls: 'bad', text: "To'xtagan" };
  return { cls: 'ok', text: 'Ishlayapti' };
}

/** Balans yana necha kunga yetadi — serverdagi hisob bilan bir xil:
 *  bugun ham hisobga kiradi, xizmat to'xtagan bo'lsa nol */
function daysLeft(s: { balance: number; charged_through: string | null }, today: string, price: number) {
  if (!s.charged_through || s.charged_through < today) return 0;
  const ahead = Math.round(
    (Date.parse(`${s.charged_through}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  );
  return ahead + 1 + (price > 0 ? Math.floor(Math.max(0, s.balance) / price) : 0);
}

/** Do'kon hali bepul sinov muddatidami */
const onTrial = (s: Shop, today: string) => !!s.trial_ends_at && s.trial_ends_at >= today;

export default function Shops() {
  const [rows, setRows] = useState<Shop[]>([]);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState<ShopsSummary | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [price, setPrice] = useState(0);
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ShopDetail | null>(null);
  // Tahrirlash va o'chirish oynalari — ro'yxatdagi tugmalardan ochiladi
  const [editing, setEditing] = useState<Shop | null>(null);
  const [removing, setRemoving] = useState<Shop | null>(null);
  const [xato, setXato] = useState('');

  function load() {
    api.shops({ q, status, limit, offset })
      .then((r) => {
        setRows(r.rows);
        setTotal(r.total);
        setXato('');
      })
      // Ilgari xato jimgina yo'qolardi: ro'yxat bo'sh qolardi va
      // "do'kon yo'q" degan taassurot tug'ilardi
      .catch((e) => setXato(e.message));
    api.shopsSummary().then(setSum).catch(() => {});
    api.stats().then((st) => setPrice(st.daily_price)).catch(() => {});
  }

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, status, limit, offset]);
  useEffect(() => setOffset(0), [q, status, limit]);

  // Holat filtri serverda qo'llanadi — sahifalash to'g'ri ishlashi uchun
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const shown = rows;
  const pageFrom = total === 0 ? 0 : offset + 1;
  const pageTo = Math.min(offset + limit, total);
  const filtered = !!q || status !== 'all';

  return (
    <>
      <div className="cards">
        <Stat glyph="house" color="accent" k="Jami do'konlar" v={fmtNum(sum?.jami ?? 0)} />
        <Stat glyph="check" color="green" k="Ishlayapti" v={fmtNum(sum?.ishlayapti ?? 0)} />
        <Stat glyph="clock" color="red" k="To'xtagan" v={fmtNum(sum?.toxtagan ?? 0)} />
        <Stat glyph="warning" color="red" k="Bloklangan" v={fmtNum(sum?.bloklangan ?? 0)} />
        <Stat glyph="banknote" color="indigo" k="Balanslarda" v={fmt(sum?.balans ?? 0)} />
        {/* Minusga tushganlar alohida: ular xizmatdan foydalangan-u,
            hisobi qoplanmagan. Umumiy qoldiq ichida yo'qolib ketmasin. */}
        {(sum?.qarzdor ?? 0) > 0 && (
          <Stat
            glyph="warning"
            color="red"
            k="Qarzda (manfiy balans)"
            v={`${fmtNum(sum!.qarzdor)} ta · ${fmt(sum!.qarz_summa)}`}
          />
        )}
      </div>

      <div className="panel">
        <div className="filters">
          <div className="f wide">
            <label>Qidiruv</label>
            <input
              placeholder="Nomi, telefoni yoki ega ismi bo'yicha qidirish..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="f">
            <label>Holat</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Barcha holat</option>
              <option value="active">Ishlayapti</option>
              <option value="stopped">To'xtagan (balans tugagan)</option>
              <option value="blocked">Bloklangan</option>
            </select>
          </div>
          <div className="f clear">
            <button
              className="btn ghost"
              onClick={() => { setQ(''); setStatus('all'); }}
              disabled={!filtered}
            >
              <Glyph name="close" size={15} /> Tozalash
            </button>
          </div>
        </div>
      </div>

      {xato && <div className="panel"><span className="error">Ro'yxat yuklanmadi: {xato}</span></div>}

      <div className="toolbar">
        <div className="panel-title" style={{ margin: 0 }}>Do'konlar ro'yxati</div>
        <div className="spacer" />
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: 90 }}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn ghost sm" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>
          Oldingi
        </button>
        <button className="btn ghost sm" onClick={() => setOffset(offset + limit)} disabled={pageTo >= total}>
          Keyingi
        </button>
        <span className="muted" style={{ fontSize: 13 }}>{pageFrom}–{pageTo} / {fmtNum(total)}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Do'kon</th>
              <th>Telefon</th>
              <th className="num">Balans</th>
              <th className="num">Pul aylanmasi</th>
              <th className="num">AI</th>
              <th className="num">Qolgan kun</th>
              <th className="num">Mijoz</th>
              <th className="num">Qarz</th>
              <th>Holat</th>
              <th>Ro'yxatdan</th>
              <th className="num">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className="clickable" onClick={async () => setSelected(await api.shop(s.id))}>
                <td>
                  <div className="cell-main">
                    {s.name} <span className="stype-tag">{SHOP_TYPE_LABEL[s.shop_type ?? 'oziq'] ?? s.shop_type}</span>
                  </div>
                  <div className="cell-sub">
                    {s.owner_name ?? '—'}
                    {s.agent_name && <> · xodim: {s.agent_name}</>}
                  </div>
                </td>
                <td className="muted">{fmtPhone(s.phone)}</td>
                {/* Balans + u NIMA UCHUN shunday ekani. Sinov muddatidagi
                    do'konda balans doim 0 turadi va sababsiz 0 chalg'itadi. */}
                <td className="num" style={{ fontWeight: 600, color: s.balance < 0 ? 'var(--red)' : undefined }}>
                  {fmtNum(s.balance)} so'm
                  <div className="cell-sub">
                    {onTrial(s, today) ? (
                      <span className="tag trial">sinov</span>
                    ) : (s.paid_total ?? 0) > 0 ? (
                      <span className="tag real">to'lagan</span>
                    ) : (
                      <span className="tag none">to'lamagan</span>
                    )}
                  </div>
                </td>
                {/* Jami to'lagan va jami yechilgan — kim haqiqiy pul
                    olib kelayotgani shundan ko'rinadi */}
                <td className="num">
                  <div style={{ color: 'var(--green)', fontWeight: 600 }}>+{fmtNum(s.paid_total ?? 0)}</div>
                  <div className="cell-sub" style={{ color: 'var(--red)' }}>−{fmtNum(s.spent_total ?? 0)}</div>
                </td>
                <td className="num" style={{ color: (s.ai_cost ?? 0) > 0 ? 'var(--text)' : 'var(--muted)' }}>
                  {fmtNum(s.ai_cost ?? 0)}
                </td>
                <td className="num">
                  {(() => {
                    const d = daysLeft(s, today, price);
                    return <b style={{ color: d <= 0 ? 'var(--red)' : d <= 5 ? 'var(--yellow)' : undefined }}>{d}</b>;
                  })()}
                </td>
                <td className="num">{s.customers_count ?? 0}</td>
                <td className="num">{s.debts_count ?? 0}</td>
                <td>
                  {(() => {
                    const st = shopState(s, today);
                    return <span className={`badge ${st.cls}`}>{st.text}</span>;
                  })()}
                </td>
                <td className="muted">{fmtWhenDay(s.created_at)}</td>
                {/* Amallar. Qatorning o'zi ham bosiladi, lekin tugmalar
                    aniqroq: o'chirish tasodifan bosilib ketmasin deb u
                    alohida turadi va qatorni ochib yubormaydi. */}
                <td className="num row-acts" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn"
                    title="Ko'rish"
                    onClick={async () => setSelected(await api.shop(s.id))}
                  >
                    <Glyph name="eye" size={16} />
                  </button>
                  <button className="icon-btn" title="Tahrirlash" onClick={() => setEditing(s)}>
                    <Glyph name="pencil" size={16} />
                  </button>
                  <button className="icon-btn danger" title="O'chirish" onClick={() => setRemoving(s)}>
                    <Glyph name="trash" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="empty">Do'kon topilmadi</div>}
      </div>

      {editing && (
        <EditShop shop={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {removing && (
        <DeleteShop shop={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); load(); }} />
      )}
      {selected && <ShopModal shop={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </>
  );
}

function Stat({ glyph, color, k, v }: { glyph: string; color: string; k: string; v: string }) {
  return (
    <div className="stat">
      <AppIcon glyph={glyph} size={38} />
      <div className="txt">
        <div className="k">{k}</div>
        <div className={`v ${color}`}>{v}</div>
      </div>
    </div>
  );
}

/** Balans harakatining turi — do'konchi tilida */
const TX_LABEL: Record<string, string> = {
  topup: "To'ldirish",
  daily: 'Kunlik haq',
  ai: 'AI savoli',
  withdraw: 'Yechim',
  refund: 'Qaytarilgan',
  grant: 'Bepul kun',
};

function ShopModal({
  shop,
  onClose,
  onChanged,
}: {
  shop: ShopDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  // Oyna ichidagi bo'limlar. Hammasi bir ustunga tizilsa modal juda
  // uzayib ketadi va kerakli joyni topish qiyin — shuning uchun tab.
  const [tab, setTab] = useState<'info' | 'balance' | 'log'>('info');
  const [data, setData] = useState(shop);
  const [msg, setMsg] = useState('');
  const [entering, setEntering] = useState(false);

  /* Kabinetga kirish.
   *
   * Server qisqa muddatli token beradi (2 soat, parolsiz). Ilova
   * boshqa manzilda (admin.buysale.uz → app.buysale.uz), shuning
   * uchun token URL HASH orqali uzatiladi: hash serverga yuborilmaydi,
   * ya'ni tarmoqda, proksida yoki jurnal fayllarda ko'rinmaydi.
   * Ilova uni o'qib, saqlaydi va manzildan darhol tozalaydi. */
  async function enterCabinet() {
    setEntering(true);
    setMsg('');
    try {
      const { token } = await api.shopLogin(data.id);
      // admin.<domen> → app.<domen>. Localhostda esa 5173-port.
      const h = location.hostname;
      const appUrl =
        h === 'localhost' || h === '127.0.0.1'
          ? `${location.protocol}//${h}:5173/`
          : `${location.protocol}//${h.replace(/^admin\./, 'app.')}/`;
      window.open(`${appUrl}#token=${encodeURIComponent(token)}`, '_blank', 'noopener');
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setEntering(false);
    }
  }
  const [grantDays, setGrantDays] = useState('30');
  // Do'kon ma'lumotlari shu oynada tahrirlanadi
  const [eName, setEName] = useState(shop.name ?? '');
  const [eOwner, setEOwner] = useState(shop.owner_name ?? '');
  const [ePhone, setEPhone] = useState(shop.phone ?? '');
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoErr, setInfoErr] = useState('');
  const changed =
    eName !== (data.name ?? '') || eOwner !== (data.owner_name ?? '') || ePhone !== (data.phone ?? '');

  // Xizmat sozlamalari — do'kon holatidan boshlab to'ldiriladi
  const [sBal, setSBal] = useState(String(shop.balance ?? 0));
  const [sPrice, setSPrice] = useState(shop.daily_price == null ? '' : String(shop.daily_price));
  const [sThrough, setSThrough] = useState(shop.charged_through ?? '');
  // Targ'ovchi xodim: odatda chek orqali o'zi biriktiriladi, lekin
  // do'konchi raqamni yozmagan yoki xato yozgan bo'lsa qo'lda qo'yiladi
  const [sAgent, setSAgent] = useState<string>(shop.agent_id ? String(shop.agent_id) : '');
  const [sBonus, setSBonus] = useState(shop.agent_bonus == null ? '' : String(shop.agent_bonus));
  const [agents, setAgents] = useState<Agent[]>([]);
  const [savingSvc, setSavingSvc] = useState(false);
  const [svcErr, setSvcErr] = useState('');
  const svcChanged =
    Number(sBal || 0) !== Number(data.balance || 0) ||
    (sPrice === '' ? data.daily_price != null : Number(sPrice) !== Number(data.daily_price)) ||
    (sThrough || '') !== (data.charged_through ?? '') ||
    (sAgent || '') !== (data.agent_id ? String(data.agent_id) : '') ||
    (sAgent !== '' && sBonus !== '' && Number(sBonus) !== Number(data.agent_bonus ?? 0));

  useEffect(() => {
    api.agents().then((r) => setAgents(r.rows)).catch(() => {});
  }, []);

  async function saveService() {
    setSavingSvc(true);
    setSvcErr('');
    try {
      // Bo'sh narx — "umumiy sozlamaga qayt" degani, 0 esa "pul
      // olinmaydi". Ikkalasi boshqa-boshqa, shuning uchun null yuboriladi.
      await api.shopService(data.id, {
        balance: Number(sBal || 0),
        daily_price: sPrice === '' ? null : Number(sPrice),
        charged_through: sThrough || null,
        agent_id: sAgent === '' ? null : Number(sAgent),
        agent_bonus: sAgent !== '' && sBonus !== '' ? Number(sBonus) : undefined,
      });
      setMsg('Xizmat sozlamalari saqlandi');
      await reload();
    } catch (e: any) {
      const c = e?.details?.error ?? e?.message ?? '';
      setSvcErr(
        c === 'price_invalid' ? "Narx noto'g'ri" : c === 'date_invalid' ? "Sana noto'g'ri" : String(c)
      );
    } finally {
      setSavingSvc(false);
    }
  }

  async function saveInfo() {
    setSavingInfo(true);
    setInfoErr('');
    try {
      await api.shopEdit(data.id, { name: eName, owner_name: eOwner, phone: ePhone });
      setMsg('Saqlandi');
      await reload();
    } catch (e: any) {
      const c = e?.details?.error ?? e?.message ?? '';
      setInfoErr(
        c === 'phone_taken'
          ? "Bu raqam boshqa do'konda ishlatilyapti"
          : c === 'phone_invalid'
            ? "Telefon raqami noto'g'ri"
            : String(c)
      );
    } finally {
      setSavingInfo(false);
    }
  }
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  async function reload() {
    const fresh = await api.shop(shop.id);
    setData(fresh);
    // Maydonlar yangi holatga tenglashadi — aks holda saqlagandan
    // keyin ham "o'zgarish bor" bo'lib turardi
    setSBal(String(fresh.balance ?? 0));
    setSPrice(fresh.daily_price == null ? '' : String(fresh.daily_price));
    setSThrough(fresh.charged_through ?? '');
    onChanged();
  }

  // Tarix bo'yicha yig'indi. Balansning O'ZI emas: bu do'kon qancha
  // to'lagani va qancha yechilganini ko'rsatadi.
  const kirim = data.transactions.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const chiqim = -data.transactions.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0);

  // Escape bosilsa yopilsin — panel klaviatura bilan ishlanadi
  useEscape(onClose);

  return (
    <div className="modal-wrap" onClick={onClose}>
      {/* Loglar bo'limida jadval besh ustunli — tor oynada
          "Nima bo'ldi" ikki-uch qatorga bo'linib, "Kim" umuman
          qirqilib ketardi. Shu bo'limda oyna kengayadi. */}
      <div className={`modal ${tab === 'log' ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AppIcon glyph="house" size={34} />
          <div className="modal-title">{data.name}</div>
        </div>
        <div className="modal-sub">
          {fmtPhone(data.phone)} {data.owner_name && `· ${data.owner_name}`}
          {data.telegram_user_id ? ' · Telegram ulangan' : ''}
        </div>

        {/* Kabinetga kirish — texnik yordam uchun. Parolsiz, do'kon
            ilovasini yangi tabda o'sha do'kon nomidan ochadi. */}
        <div className="toolbar" style={{ margin: '10px 0 4px' }}>
          <button className="btn ghost" onClick={enterCabinet} disabled={entering}>
            <Glyph name="logout" size={14} /> {entering ? 'Ochilmoqda…' : 'Kabinetga kirish'}
          </button>
        </div>

        <div className="cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 14 }}>
          <div className="stat">
            <div className="txt">
              <div className="k">Mijozlar</div>
              <div className="v" style={{ fontSize: 18 }}>{data.stats.customers}</div>
            </div>
          </div>
          <div className="stat">
            <div className="txt">
              <div className="k">Ochiq qarz</div>
              <div className="v red" style={{ fontSize: 18 }}>{fmt(data.stats.open_debt)}</div>
            </div>
          </div>
          <div className="stat">
            <div className="txt">
              <div className="k">Sotuvlar</div>
              <div className="v" style={{ fontSize: 18 }}>{data.stats.sales}</div>
            </div>
          </div>
        </div>

        {/* Bo'limlar — do'kon kartochkasi uzun bo'lgani uchun ajratilgan */}
        <div className="tabs">
          <button className={`tab ${tab === 'info' ? 'on' : ''}`} onClick={() => setTab('info')}>
            <Glyph name="book" size={14} /> Ma'lumotlar
          </button>
          <button className={`tab ${tab === 'balance' ? 'on' : ''}`} onClick={() => setTab('balance')}>
            <Glyph name="banknote" size={14} /> Balans tarixi
            <span className="tab-count">{data.transactions.length}</span>
          </button>
          <button className={`tab ${tab === 'log' ? 'on' : ''}`} onClick={() => setTab('log')}>
            <Glyph name="note" size={14} /> Loglar
          </button>
        </div>

        {tab === 'info' && (<>
        {/* Do'kon ma'lumotlari — SHU YERDA tahrirlanadi. Ilgari ular
            faqat sarlavhadagi yozuv edi va o'zgartirish uchun alohida
            oyna ochish kerak bo'lardi. */}
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-title">Do'kon ma'lumotlari</div>
          <div className="field-grid">
            <div className="set-field">
              <label>Do'kon nomi</label>
              <input value={eName} onChange={(e) => setEName(e.target.value)} />
            </div>
            <div className="set-field">
              <label>Egasi</label>
              <input value={eOwner} onChange={(e) => setEOwner(e.target.value)} />
            </div>
            <div className="set-field">
              <label>Telefon</label>
              <input value={ePhone} onChange={(e) => setEPhone(e.target.value)} />
              <div className="set-hint">Ilovaga shu raqam bilan kiriladi</div>
            </div>
            <div className="set-field">
              <label>Telegram</label>
              <div className="set-static">{data.telegram_user_id ? 'Ulangan' : 'Ulanmagan'}</div>
            </div>
          </div>
          {infoErr && <div className="err-msg">{infoErr}</div>}
          <div className="toolbar">
            <button className="btn sm" onClick={saveInfo} disabled={savingInfo || !eName.trim() || !changed}>
              {savingInfo ? 'Saqlanyapti…' : changed ? 'Saqlash' : "O'zgarish yo'q"}
            </button>
          </div>
        </div>

        {/* Balans va xizmat — HAMMASI shu yerda o'zgartiriladi.
            Ilgari uchalasi ham qulflangan edi: balansga faqat "qo'shish",
            kunga faqat "bepul kun berish", narx esa umumiy sozlamada
            turardi va uni o'zgartirish hamma do'konga tegib ketardi. */}
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-title">Balans va xizmat</div>
          <div className="field-grid">
            <div className="set-field">
              <label>Balans (so'm)</label>
              <input
                type="number"
                value={sBal}
                onChange={(e) => setSBal(e.target.value)}
                style={{ color: Number(sBal) < 0 ? 'var(--red)' : undefined, fontWeight: 600 }}
              />
              <div className="set-hint">Aniq qiymat qo'yiladi, farqi tarixga yoziladi</div>
            </div>
            <div className="set-field">
              <label>Kunlik haq (so'm)</label>
              <input
                type="number"
                min={0}
                value={sPrice}
                onChange={(e) => setSPrice(e.target.value)}
                placeholder={String(data.service.daily_price)}
              />
              <div className="set-hint">
                {sPrice === ''
                  ? `Bo'sh — umumiy narx (${fmt(data.service.daily_price)})`
                  : Number(sPrice) === 0
                    ? 'Bu do\'kondan pul olinmaydi'
                    : "Faqat shu do'kon uchun"}
              </div>
            </div>
            <div className="set-field">
              <label>Xizmat to'langan sana</label>
              <input type="date" value={sThrough} onChange={(e) => setSThrough(e.target.value)} />
              <div className="set-hint">Shu kungacha to'langan hisoblanadi</div>
            </div>
            <div className="set-field">
              <label>Targ'ovchi xodim</label>
              <select value={sAgent} onChange={(e) => setSAgent(e.target.value)}>
                <option value="">— biriktirilmagan —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name ?? a.username}
                  </option>
                ))}
              </select>
              <div className="set-hint">
                {data.agent_linked_at
                  ? `Biriktirilgan: ${fmtWhenDay(data.agent_linked_at)}`
                  : "Do'konchi chekda xodim raqamini yozsa o'zi biriktiriladi"}
              </div>
            </div>
            <div className="set-field">
              <label>Xodim mukofoti (so'm)</label>
              <input
                type="number"
                min={0}
                value={sBonus}
                onChange={(e) => setSBonus(e.target.value)}
                disabled={sAgent === ''}
                placeholder="100000"
              />
              <div className="set-hint">Shu do'kon uchun xodimga yoziladigan summa</div>
            </div>
            <div className="set-field">
              <label>Hozirgi holat</label>
              <div className={`set-static ${data.service.active ? 'green' : 'red'}`}>
                {data.service.active
                  ? `${data.service.days_left} kun · ${data.service.runs_out_on} gacha${data.service.on_trial ? ' · sinov' : ''}`
                  : "balans tugagan — to'xtagan"}
              </div>
            </div>
          </div>
          {svcErr && <div className="err-msg">{svcErr}</div>}
          <div className="toolbar">
            <button className="btn sm" onClick={saveService} disabled={savingSvc || !svcChanged}>
              {savingSvc ? 'Saqlanyapti…' : svcChanged ? 'Saqlash' : "O'zgarish yo'q"}
            </button>
          </div>

          <div className="toolbar">
            <input
              style={{ width: 80 }}
              value={grantDays}
              onChange={(e) => setGrantDays(e.target.value)}
              placeholder="kun"
            />
            <button
              className="btn sm"
              onClick={async () => {
                await api.grantDays(data.id, Number(grantDays) || 30);
                setMsg("Bepul kun qo'shildi");
                reload();
              }}
            >
              Bepul kun berish
            </button>
          </div>

          <div className="toolbar">
            <input
              style={{ width: 140 }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Summa (± )"
            />
            <button
              className="btn sm ghost"
              disabled={!amount}
              onClick={async () => {
                await api.adjustBalance(data.id, parseInt(amount.replace(/[^\d-]/g, ''), 10) || 0, 'Admin tuzatishi');
                setAmount('');
                setMsg('Balans o‘zgartirildi');
                reload();
              }}
            >
              Balansga qo'shish
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Kirish huquqi</div>
          {data.is_blocked ? (
            <>
              <div className="muted" style={{ marginBottom: 8 }}>
                Bloklangan{data.blocked_reason ? `: ${data.blocked_reason}` : ''}
              </div>
              <button
                className="btn sm"
                onClick={async () => {
                  await api.blockShop(data.id, false);
                  setMsg('Blokdan chiqarildi');
                  reload();
                }}
              >
                Blokdan chiqarish
              </button>
            </>
          ) : (
            <div className="toolbar">
              <input
                style={{ flex: 1 }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Bloklash sababi"
              />
              <button
                className="btn sm danger"
                onClick={async () => {
                  await api.blockShop(data.id, true, reason || undefined);
                  setMsg('Bloklandi');
                  reload();
                }}
              >
                Bloklash
              </button>
            </div>
          )}
        </div>

        </>)}

        {tab === 'balance' && (
          <div className="panel">
            {/* Kirim va chiqim yig'indisi — tarixni satrma-satr qo'shib
                chiqmasdan turib do'kon qancha to'laganini ko'rish uchun */}
            <div className="sum-cards">
              <div className="sum-card in">
                <div className="k">Jami kirim</div>
                <div className="v">+{fmt(kirim)}</div>
              </div>
              <div className="sum-card out">
                <div className="k">Jami chiqim</div>
                <div className="v">−{fmt(chiqim)}</div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Sana</th>
                    <th>Turi</th>
                    <th className="num">Summa</th>
                    <th>Izoh</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="muted">{fmtWhen(t.created_at)}</td>
                      <td>
                        <span className={`badge ${t.amount > 0 ? 'ok' : t.amount < 0 ? 'bad' : ''}`}>
                          {TX_LABEL[t.type] ?? t.type}
                        </span>
                      </td>
                      <td
                        className="num"
                        style={{
                          fontWeight: 600,
                          color:
                            t.amount === 0 ? 'var(--muted)' : t.amount > 0 ? 'var(--green)' : 'var(--red)',
                        }}
                      >
                        {t.amount > 0 ? '+' : ''}
                        {fmtNum(t.amount)} so'm
                      </td>
                      <td className="muted">{t.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.transactions.length === 0 && <div className="empty">Hali harakat bo'lmagan</div>}
          </div>
        )}

        {tab === 'log' && <ShopLog shopId={data.id} />}

        {msg && <p className="hint" style={{ color: 'var(--green)' }}>{msg}</p>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}


/** Do'kon ma'lumotini tahrirlash oynasi */
function EditShop({ shop, onClose, onSaved }: { shop: Shop; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(shop.name ?? '');
  const [owner, setOwner] = useState(shop.owner_name ?? '');
  const [phone, setPhone] = useState(shop.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true);
    setErr('');
    try {
      await api.shopEdit(shop.id, { name, owner_name: owner, phone });
      onSaved();
    } catch (e: any) {
      // Server sababni kod bilan qaytaradi — o'zbekchaga o'giramiz
      const c = e?.details?.error ?? e?.message ?? '';
      setErr(
        c === 'phone_taken'
          ? "Bu raqam boshqa do'konda ishlatilyapti"
          : c === 'phone_invalid'
            ? "Telefon raqami noto'g'ri"
            : c === 'name_required'
              ? "Nomi bo'sh bo'lmasin"
              : String(c)
      );
    } finally {
      setBusy(false);
    }
  }

  // Escape bosilsa yopilsin — panel klaviatura bilan ishlanadi
  useEscape(onClose);

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AppIcon glyph="house" size={30} />
          <div className="modal-title">Do'konni tahrirlash</div>
        </div>
        <div className="set-field">
          <label>Do'kon nomi</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="set-field">
          <label>Egasi</label>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} />
        </div>
        <div className="set-field">
          <label>Telefon</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="set-hint">Bu raqam bilan ilovaga kiriladi — o'zgartirsangiz eski raqam ishlamaydi</div>
        </div>
        {err && <div className="err-msg">{err}</div>}
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn" onClick={save} disabled={busy || !name.trim()}>
            {busy ? 'Saqlanyapti…' : 'Saqlash'}
          </button>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Bekor qilish</button>
        </div>
      </div>
    </div>
  );
}

/**
 * O'chirish oynasi.
 *
 * O'chirish qaytarib bo'lmaydi va butun do'konni — mijozlari, qarzlari,
 * tovarlari bilan — yo'q qiladi. Shuning uchun tugma emas, NOMNI QO'LDA
 * yozish talab qilinadi: chalg'ib bosilgan tugma bir do'konning butun
 * ishini o'chirib yubormasin.
 */
function DeleteShop({ shop, onClose, onDone }: { shop: Shop; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const mos = text.trim() === (shop.name ?? '').trim();

  async function go() {
    setBusy(true);
    setErr('');
    try {
      await api.shopDelete(shop.id, text.trim());
      onDone();
    } catch (e: any) {
      setErr(e?.details?.error ?? e?.message ?? "O'chirib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  // Escape bosilsa yopilsin — panel klaviatura bilan ishlanadi
  useEscape(onClose);

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AppIcon glyph="warning" size={30} color="red" />
          <div className="modal-title">Do'konni o'chirish</div>
        </div>
        <p className="muted" style={{ lineHeight: 1.5 }}>
          <b>{shop.name}</b> ({fmtPhone(shop.phone)}) butunlay o'chiriladi: mijozlari, qarzlari,
          tovarlari, savdolari va to'lovlari bilan birga. <b>Qaytarib bo'lmaydi.</b>
        </p>
        <div className="set-field">
          <label>Tasdiqlash uchun do'kon nomini yozing</label>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={shop.name ?? ''} />
        </div>
        {err && <div className="err-msg">{err}</div>}
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn danger" onClick={go} disabled={busy || !mos}>
            {busy ? "O'chirilyapti…" : "Butunlay o'chirish"}
          </button>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Bekor qilish</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Do'kon jurnali ═══════════
 *
 * Do'konda bo'lib o'tgan HAMMA narsa vaqt bo'yicha bir ro'yxatda:
 * savdo, qaytarish, qarz, ombor harakati, xarajat, balans, eslatma,
 * xodim kirishi, AI savoli va admin amallari.
 *
 * Ma'lumot alohida "jurnal" jadvalidan emas — server mavjud
 * jadvallarni o'qib birlashtiradi (backend: /admin/shops/:id/activity).
 * Shu sabab do'konning BUTUN o'tmishi ko'rinadi, faqat shu funksiya
 * qo'shilgandan keyingisi emas.
 */

/** Har tur uchun nom va rang — ro'yxatda ko'z bilan ajratish uchun */
const LOG_TUR: Record<string, { nom: string; rang: string }> = {
  savdo: { nom: 'Savdo', rang: 'green' },
  qaytarish: { nom: 'Qaytarish', rang: 'red' },
  qarz: { nom: 'Qarz', rang: 'amber' },
  qarz_tolov: { nom: "Qarz to'lovi", rang: 'green' },
  ombor: { nom: 'Ombor', rang: 'blue' },
  xarajat: { nom: 'Xarajat', rang: 'red' },
  balans: { nom: 'Balans', rang: 'indigo' },
  eslatma: { nom: 'Eslatma', rang: 'teal' },
  kirish: { nom: 'Kirish', rang: 'gray' },
  xodim: { nom: 'Xodim', rang: 'indigo' },
  mijoz: { nom: 'Mijoz', rang: 'teal' },
  tovar: { nom: 'Tovar', rang: 'blue' },
  taminotchi: { nom: "Ta'minotchi", rang: 'amber' },
  taminotchi_qarz: { nom: "Ta'minotchi qarzi", rang: 'amber' },
  buyurtma: { nom: 'Buyurtma', rang: 'blue' },
  chek: { nom: 'Chek', rang: 'indigo' },
  ai: { nom: 'AI', rang: 'indigo' },
  admin: { nom: 'Admin', rang: 'gray' },
};

function ShopLog({ shopId }: { shopId: number }) {
  const [rows, setRows] = useState<ShopActivity[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tur, setTur] = useState('');
  const [q, setQ] = useState('');
  const [yuk, setYuk] = useState(true);
  const [err, setErr] = useState('');

  /* Tur almashganda serverdan QAYTA so'raladi.
   *
   * Ro'yxat eng yangi 300 yozuv bilan cheklangan, tugmadagi son esa
   * HAQIQIY sonni ko'rsatadi. Agar filtr shu 300 taning ichidan
   * qidirilsa, "Kirish 92" deb turgan tugma bosilganda 20 tasi
   * chiqib qolardi — son bilan ro'yxat bir-biriga to'g'ri kelmasdi.
   * Server esa o'sha turdagi eng yangi 300 tasini beradi. */
  useEffect(() => {
    let bekor = false;
    setYuk(true);
    api
      .shopActivity(shopId, 300, tur)
      .then((d) => {
        if (bekor) return;
        setRows(d.items);
        // Sanoq faqat "Hammasi" da yangilanadi: tur tanlangan javobda
        // boshqa turlarning soni bo'lmaydi
        if (!tur) setCounts(d.counts);
      })
      .catch((e) => !bekor && setErr(e.message))
      .finally(() => !bekor && setYuk(false));
    return () => {
      bekor = true;
    };
  }, [shopId, tur]);

  // Tur serverda ajratiladi, qidiruv esa shu yerda — yozib turganda
  // har harfda so'rov yuborilmasin
  const matn = q.trim().toLowerCase();
  const korinadigan = matn
    ? rows.filter((r) => `${r.title} ${r.detail ?? ''} ${r.who ?? ''}`.toLowerCase().includes(matn))
    : rows;

  if (yuk && rows.length === 0) return <div className="panel"><div className="empty">Yuklanmoqda…</div></div>;
  if (err) return <div className="panel"><div className="error">{err}</div></div>;

  return (
    <div className="panel">
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Do'konda bo'lib o'tgan hamma harakat — eng yangisidan
      </div>

      {/* Turlar bo'yicha filtr. Har tugmada nechtaligi ko'rinadi —
          "bu do'konda umuman savdo bo'lganmi" degan savolga darhol
          javob beradi. */}
      <div className="stype-tabs" style={{ marginBottom: 12 }}>
        <button className={`stype-tab ${tur === '' ? 'on' : ''}`} onClick={() => setTur('')}>
          Hammasi
          <i className="stype-badge">{Object.values(counts).reduce((a, b) => a + b, 0)}</i>
        </button>
        {Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => (
            <button key={k} className={`stype-tab ${tur === k ? 'on' : ''}`} onClick={() => setTur(k)}>
              {LOG_TUR[k]?.nom ?? k}
              <i className="stype-badge">{n}</i>
            </button>
          ))}
      </div>

      <input
        placeholder="Qidiruv: nom, izoh yoki kim qilgani"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Vaqt</th>
              <th>Turi</th>
              <th>Nima bo'ldi</th>
              <th className="num">Summa</th>
              <th>Kim</th>
            </tr>
          </thead>
          <tbody>
            {korinadigan.map((r, i) => (
              <tr key={`${r.kind}-${r.at}-${i}`}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                  {fmtWhen(r.at)}
                </td>
                <td>
                  <span className={`badge ${LOG_TUR[r.kind]?.rang ?? ''}`}>
                    {LOG_TUR[r.kind]?.nom ?? r.kind}
                  </span>
                </td>
                <td>
                  <div>{r.title}</div>
                  {r.detail && <div className="muted" style={{ fontSize: 12.5 }}>{r.detail}</div>}
                </td>
                <td
                  className="num"
                  style={{
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    color:
                      r.amount == null
                        ? 'var(--muted)'
                        : r.amount > 0
                          ? 'var(--green)'
                          : r.amount < 0
                            ? 'var(--red)'
                            : 'var(--muted)',
                  }}
                >
                  {r.amount == null ? '—' : `${r.amount > 0 ? '+' : ''}${fmtNum(r.amount)} so'm`}
                </td>
                <td className="muted">{r.who ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {korinadigan.length === 0 && <div className="empty">Bunday yozuv yo'q</div>}
    </div>
  );
}
