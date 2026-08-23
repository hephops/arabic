import { useEffect, useState } from 'react';
import { api, fmt, fmtNum, fmtPhone, type Admin, type Agent, type AgentDetail, fmtWhen } from '../api';
import { AppIcon, Glyph } from '../icons';
import { useEscape } from '../useEscape';

// Xodimlar — BuySale'ning targ'ovchi agentlari.
//
// Ular do'konlarni ko'ndirib dasturga ulaydi. Har ulangan do'kon uchun
// mukofot yoziladi (sozlamadagi agent_bonus). Do'kon xodimga chek
// orqali biriktiriladi: do'konchi chek yuborganda xodimning telefon
// raqamini yozadi, admin chekni tasdiqlaganda bog'lanish yaraladi.
//
// Xodimning o'zi ham shu panelga kiradi, lekin faqat O'Z sahifasini
// ko'radi (My.tsx) — do'konlar, to'lovlar, sozlamalar unga yopiq.

// Vaqt O'zbekiston mintaqasida ko'rsatiladi (api.ts: fmtWhen)
const when = fmtWhen;

export default function Agents({ me }: { me: Admin }) {
  const [rows, setRows] = useState<Agent[]>([]);
  const [bonus, setBonus] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<Agent | 'new' | null>(null);
  const [del, setDel] = useState<Agent | null>(null);
  const isSuper = me.role === 'super';

  function load() {
    api
      .agents()
      .then((r) => {
        setRows(r.rows);
        setBonus(r.bonus);
      })
      .catch(() => {});
  }
  useEffect(load, []);

  const jami = rows.reduce(
    (a, r) => ({
      shops: a.shops + (r.shops ?? 0),
      earned: a.earned + (r.earned ?? 0),
      paid: a.paid + (r.paid ?? 0),
      left: a.left + (r.left ?? 0),
    }),
    { shops: 0, earned: 0, paid: 0, left: 0 }
  );

  return (
    <>
      <div className="cards ai-cards">
        <Stat glyph="employee" color="accent" k="Xodimlar" v={fmtNum(rows.length)} sub={`har do'kon uchun ${fmt(bonus)}`} />
        <Stat glyph="house" color="indigo" k="Ulangan do'konlar" v={fmtNum(jami.shops)} />
        <Stat glyph="banknote" color="green" k="Ishlab topilgan" v={fmt(jami.earned)} />
        <Stat glyph="wallet" color="red" k="To'lanmagan qoldiq" v={fmt(jami.left)} sub={`berilgani ${fmt(jami.paid)}`} />
      </div>

      {isSuper && (
        <div className="toolbar">
          <button className="btn" onClick={() => setForm('new')}>
            <Glyph name="plus" size={16} color="#fff" /> Yangi xodim
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Xodim</th>
              <th>Telefon</th>
              <th className="num">Do'kon</th>
              <th className="num">Ishlagan</th>
              <th className="num">Berilgan</th>
              <th className="num">Qoldiq</th>
              <th>Oxirgi kirish</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="cell-main">
                    {a.name ?? a.username}
                    {!a.is_active && <span className="tag none" style={{ marginLeft: 6 }}>faol emas</span>}
                  </div>
                  <div className="cell-sub">@{a.username}</div>
                </td>
                <td>{fmtPhone(a.phone ?? '')}</td>
                <td className="num">{fmtNum(a.shops ?? 0)}</td>
                <td className="num">{fmt(a.earned ?? 0)}</td>
                <td className="num muted">{fmt(a.paid ?? 0)}</td>
                <td className="num">
                  <b style={{ color: (a.left ?? 0) > 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(a.left ?? 0)}</b>
                </td>
                <td className="muted">{when(a.last_login_at)}</td>
                <td className="row-acts">
                  <button className="icon-btn" title="Ochish" onClick={() => setOpen(a.id)}>
                    <Glyph name="eye" size={15} />
                  </button>
                  {isSuper && (
                    <>
                      <button className="icon-btn" title="Tahrirlash" onClick={() => setForm(a)}>
                        <Glyph name="pencil" size={15} />
                      </button>
                      <button className="icon-btn danger" title="O'chirish" onClick={() => setDel(a)}>
                        <Glyph name="trash" size={15} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Hozircha xodim yo'q</div>}
      </div>

      {open !== null && (
        <AgentModal id={open} isSuper={isSuper} onClose={() => setOpen(null)} onChanged={load} />
      )}
      {form && (
        <AgentForm
          agent={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
      {del && (
        <DeleteAgent
          agent={del}
          onClose={() => setDel(null)}
          onDone={() => {
            setDel(null);
            load();
          }}
        />
      )}
    </>
  );
}

/** Xodim kartochkasi: ulagan do'konlari va mukofot to'lovlari */
function AgentModal({
  id,
  isSuper,
  onClose,
  onChanged,
}: {
  id: number;
  isSuper: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<AgentDetail | null>(null);
  const [tab, setTab] = useState<'shops' | 'money'>('shops');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.agent(id).then(setData).catch(() => {});
  }
  useEffect(load, [id]);

  async function pay() {
    const v = Number(amount.replace(/\D/g, '') || 0);
    if (!v) return setError('Summani kiriting');
    setBusy(true);
    setError('');
    try {
      await api.addPayout(id, { amount: v, note: note.trim() || undefined });
      setAmount('');
      setNote('');
      load();
      onChanged();
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePayout(pid: number) {
    if (!confirm("To'lov o'chirilsinmi?")) return;
    await api.deletePayout(pid).catch(() => {});
    load();
    onChanged();
  }

  const a = data?.agent;
  // Escape bosilsa yopilsin — panel klaviatura bilan ishlanadi
  useEscape(onClose);

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AppIcon glyph="employee" size={34} />
          <div>
            <div className="modal-title">{a?.name ?? '...'}</div>
            <div className="modal-sub" style={{ marginBottom: 0 }}>
              @{a?.username} · {fmtPhone(a?.phone ?? '')}
            </div>
          </div>
        </div>

        <div className="sum-cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="sum-card in">
            <div className="k">Do'kon</div>
            <div className="v">{fmtNum(data?.stats.shops ?? 0)}</div>
          </div>
          <div className="sum-card in">
            <div className="k">Ishlagan</div>
            <div className="v">{fmt(data?.stats.earned ?? 0)}</div>
          </div>
          <div className="sum-card out">
            <div className="k">Berilgan</div>
            <div className="v">{fmt(data?.stats.paid ?? 0)}</div>
          </div>
          <div className="sum-card out">
            <div className="k">Qoldiq</div>
            <div className="v">{fmt(data?.stats.left ?? 0)}</div>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'shops' ? 'on' : ''}`} onClick={() => setTab('shops')}>
            Ulagan do'konlari <span className="tab-count">{data?.shops.length ?? 0}</span>
          </button>
          <button className={`tab ${tab === 'money' ? 'on' : ''}`} onClick={() => setTab('money')}>
            Mukofot to'lovlari <span className="tab-count">{data?.payouts.length ?? 0}</span>
          </button>
        </div>

        {tab === 'shops' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Do'kon</th>
                  <th>Egasi</th>
                  <th className="num">Mukofot</th>
                  <th>Ulangan sana</th>
                </tr>
              </thead>
              <tbody>
                {(data?.shops ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-main">{s.name}</div>
                      <div className="cell-sub">{fmtPhone(s.phone)}</div>
                    </td>
                    <td className="muted">{s.owner_name ?? '—'}</td>
                    <td className="num">{fmt(s.agent_bonus ?? 0)}</td>
                    <td className="muted">{when(s.agent_linked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && data.shops.length === 0 && <div className="empty">Hali do'kon ulanmagan</div>}
          </div>
        )}

        {tab === 'money' && (
          <>
            {isSuper && (
              <div className="field-grid">
                <div>
                  <label>Summa</label>
                  <input
                    value={amount ? fmtNum(Number(amount.replace(/\D/g, '') || 0)) : ''}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="numeric"
                    placeholder="100 000"
                  />
                </div>
                <div>
                  <label>Izoh</label>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Avans, oylik..." />
                </div>
              </div>
            )}
            {isSuper && (
              <button className="btn" onClick={pay} disabled={busy}>
                <Glyph name="plus" size={16} color="#fff" /> To'lovni yozish
              </button>
            )}
            {error && <div className="error">{error}</div>}

            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Sana</th>
                    <th className="num">Summa</th>
                    <th>Izoh</th>
                    <th>Kim yozdi</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(data?.payouts ?? []).map((p) => (
                    <tr key={p.id}>
                      <td className="muted">{p.paid_at ?? when(p.created_at)}</td>
                      <td className="num"><b>{fmt(p.amount)}</b></td>
                      <td className="muted">{p.note ?? '—'}</td>
                      <td className="muted">{p.by_username ? `@${p.by_username}` : '—'}</td>
                      <td className="row-acts">
                        {isSuper && (
                          <button className="icon-btn danger" title="O'chirish" onClick={() => removePayout(p.id)}>
                            <Glyph name="trash" size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && data.payouts.length === 0 && <div className="empty">To'lov yozilmagan</div>}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Yopish</button>
        </div>
      </div>
    </div>
  );
}

/** Yangi xodim yoki tahrirlash */
function AgentForm({ agent, onClose, onSaved }: { agent: Agent | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(agent?.name ?? '');
  const [phone, setPhone] = useState(agent?.phone ?? '');
  const [username, setUsername] = useState(agent?.username ?? '');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(agent ? !!agent.is_active : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ERRORS: Record<string, string> = {
    username_short: 'Login kamida 3 belgidan iborat bo\'lsin',
    username_taken: 'Bunday login band',
    password_short: 'Parol kamida 6 belgidan iborat bo\'lsin',
    name_required: 'Ismni kiriting',
    phone_invalid: "Telefon raqami to'liq emas",
    phone_taken: 'Bu raqam boshqa xodimga biriktirilgan',
  };

  async function save() {
    setBusy(true);
    setError('');
    try {
      if (agent) {
        await api.updateAgent(agent.id, {
          name,
          phone,
          is_active: active,
          password: password || undefined,
        });
      } else {
        await api.createAgent({ username, password, name, phone });
      }
      onSaved();
    } catch (e: any) {
      setError(ERRORS[e.details?.error] ?? 'Xatolik: ' + e.message);
      setBusy(false);
    }
  }

  // Escape bosilsa yopilsin — panel klaviatura bilan ishlanadi
  useEscape(onClose);

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AppIcon glyph="employee" size={34} />
          <div className="modal-title">{agent ? 'Xodimni tahrirlash' : 'Yangi xodim'}</div>
        </div>
        <div className="modal-sub">
          Xodim shu login bilan panelga kiradi va faqat o'z natijasini ko'radi.
        </div>

        <div className="field-grid">
          <div>
            <label>Ism familiya *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alisher Karimov" />
          </div>
          <div>
            <label>Telefon *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
          </div>
          <div>
            <label>Login *</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alisher"
              disabled={!!agent}
            />
          </div>
          <div>
            <label>{agent ? 'Yangi parol' : 'Parol *'}</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={agent ? "o'zgartirmaslik uchun bo'sh qoldiring" : 'kamida 6 belgi'}
            />
          </div>
        </div>

        {/* Do'konchi chek yuborganda AYNAN shu raqamni yozadi — shuning
            uchun u xodimning asosiy kaliti */}
        <p className="hint">Do'konchi chek yuborganda shu raqamni yozadi, do'kon shu xodimga biriktiriladi.</p>

        {agent && (
          <label className="switch-row">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Faol</span>
          </label>
        )}

        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Bekor qilish</button>
          <button className="btn" onClick={save} disabled={busy}>
            <Glyph name="check" size={16} color="#fff" /> Saqlash
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteAgent({ agent, onClose, onDone }: { agent: Agent; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await api.deleteAgent(agent.id);
      onDone();
    } catch (e: any) {
      setError(
        e.details?.error === 'has_shops'
          ? `Bu xodimga ${e.details.shops} ta do'kon biriktirilgan — o'chirib bo'lmaydi. "Faol emas" qilib qo'ying.`
          : 'Xatolik: ' + e.message
      );
      setBusy(false);
    }
  }

  // Escape bosilsa yopilsin — panel klaviatura bilan ishlanadi
  useEscape(onClose);

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AppIcon glyph="trash" size={34} />
          <div className="modal-title">Xodimni o'chirish</div>
        </div>
        <div className="modal-sub">
          {agent.name} (@{agent.username}) butunlay o'chiriladi. Hisob tarixi ham ketadi.
        </div>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Bekor qilish</button>
          <button className="btn danger" onClick={go} disabled={busy}>O'chirish</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ glyph, color, k, v, sub }: { glyph: string; color: string; k: string; v: string; sub?: string }) {
  return (
    <div className="stat">
      <AppIcon glyph={glyph} size={38} />
      <div className="txt">
        <div className="k">{k}</div>
        <div className={`v ${color}`}>{v}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}
