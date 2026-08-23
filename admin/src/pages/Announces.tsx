import { useEffect, useState } from 'react';
import { api } from '../api';
import AnnounceModal, {
  parseAnnounceList,
  yangiId,
  kimgaNomi,
  BOSH,
  type AnnounceCfg,
} from './Announce';
import { SHOP_TYPES } from '../shopTypes';

/* ═══════════ Yuguruvchi e'lonlar ═══════════
 *
 * Do'konchining ilovasida, bo'lim nomi tagidan o'tib turadigan yozuv.
 *
 * Bitta e'lon yetarli emas: zargarlarga bir xabar, dorixonalarga
 * boshqasi kerak bo'ladi. Shuning uchun ro'yxat — har biriga o'z matni,
 * rangi, tezligi va kimga ko'rinishi.
 *
 * Yuqoridagi tugmalar ro'yxatni filtrlaydi. Bo'lim tanlangan bo'lsa
 * "+" bosilganda yangi e'lon DARHOL o'sha bo'limga yo'naltiriladi —
 * "kimga ko'rinsin" ni qo'lda tanlash shart emas.
 *
 * Saqlanishi: settings jadvalidagi bitta 'announce' kaliti (JSON
 * ro'yxat). Alohida jadval ochilmadi — ustun qo'shish har o'zgarishda
 * migratsiya talab qilardi.
 */

export default function Announces() {
  const [raw, setRaw] = useState('');
  const [edit, setEdit] = useState<AnnounceCfg | null>(null);
  const [stype, setStype] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api
      .settings()
      .then((d) => setRaw(d.announce ?? ''))
      .catch((e) => setErr(e.message));
  }, []);

  const list = parseAnnounceList(raw);
  const korinadigan = stype ? list.filter((a) => a.audience === `type:${stype}`) : list;
  const typeInfo = SHOP_TYPES.find((x) => x.id === stype);

  async function yoz(yangi: AnnounceCfg[], xabar: string) {
    setErr('');
    try {
      const d = await api.saveSettings({ announce: JSON.stringify(yangi) });
      setRaw(d.announce ?? '');
      setMsg(xabar);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function saqla(v: AnnounceCfg) {
    const bor = list.some((a) => a.id === v.id);
    await yoz(bor ? list.map((a) => (a.id === v.id ? v : a)) : [...list, v], "E'lon saqlandi");
    setEdit(null);
  }

  async function ochir(id: string) {
    if (!confirm("Shu e'lon o'chirilsinmi?")) return;
    await yoz(list.filter((a) => a.id !== id), "E'lon o'chirildi");
  }

  /** Yoqish/o'chirish — oyna ochmasdan, bir bosishda */
  async function almashtir(id: string) {
    await yoz(
      list.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
      ''
    );
  }

  function yangi() {
    setEdit({
      ...BOSH,
      id: yangiId(list),
      enabled: true,
      audience: stype ? `type:${stype}` : 'all',
    });
  }

  /** Shu bo'limda nechta e'lon bor — tugmadagi kichik son */
  const soni = (t: string) => list.filter((a) => a.audience === `type:${t}`).length;

  return (
    <>
      {/* Qaysi bo'lim uchun. "Hammasi" — barcha e'lonlar bir ro'yxatda. */}
      <div className="panel">
        <h3>Qaysi bo'lim uchun</h3>
        <div className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>
          Bo'limni tanlab, faqat o'sha turdagi do'konlarga ko'rinadigan e'lon yarating
        </div>
        <div className="stype-tabs">
          <button className={`stype-tab ${stype === '' ? 'on' : ''}`} onClick={() => setStype('')}>
            📋 Hammasi
            {list.length > 0 && <i className="stype-badge">{list.length}</i>}
          </button>
          {SHOP_TYPES.map((t) => {
            const n = soni(t.id);
            return (
              <button
                key={t.id}
                className={`stype-tab ${stype === t.id ? 'on' : ''}`}
                onClick={() => setStype(t.id)}
              >
                {t.emoji} {t.label}
                {n > 0 && <i className="stype-badge">{n}</i>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Yuguruvchi e'lon</h3>
            <div className="muted" style={{ marginTop: -6, fontSize: 13 }}>
              {stype
                ? `Faqat ${typeInfo?.emoji} ${typeInfo?.label} do'konlariga ko'rinadi`
                : 'Ilovaning tepasida, bo‘lim nomi tagidan o‘tib turadi'}
            </div>
          </div>
          <button className="btn" onClick={yangi}>+ Yangi e'lon</button>
        </div>

        {korinadigan.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            {stype ? "Bu bo'lim uchun e'lon yo'q" : 'Hozircha e‘lon yo‘q'} — «+ Yangi e'lon» bosing
          </div>
        ) : (
          <div className="ann-list">
            {korinadigan.map((a) => (
              <div className={`ann-item ${a.enabled ? '' : 'off'}`} key={a.id}>
                <div
                  className="ann-preview"
                  style={{
                    background: `linear-gradient(90deg, ${a.bg1}, ${a.bg2})`,
                    color: a.color,
                    fontSize: `${a.size}px`,
                    fontWeight: a.weight === 'bold' ? 700 : a.weight === 'medium' ? 500 : 400,
                  }}
                >
                  <div className="ann-run" style={{ animationDuration: `${a.speed}s` }}>
                    <span>{a.text || 'Matn yo‘q'}</span>
                    <span aria-hidden="true">{a.text || 'Matn yo‘q'}</span>
                  </div>
                </div>
                <div className="ann-row">
                  <span className="ann-who">{kimgaNomi(a.audience)}</span>
                  <span className={`ann-state ${a.enabled ? 'on' : ''}`}>
                    {a.enabled ? 'Ko‘rinyapti' : 'O‘chiq'}
                  </span>
                  <div className="ann-acts">
                    <button className="btn ghost" onClick={() => almashtir(a.id)}>
                      {a.enabled ? 'O‘chirish' : 'Yoqish'}
                    </button>
                    <button className="btn ghost" onClick={() => setEdit(a)}>Sozlash</button>
                    <button className="btn ghost danger" onClick={() => ochir(a.id)}>Olib tashlash</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(msg || err) && (
          <div style={{ marginTop: 12 }}>
            {msg && <span className="ok-msg">{msg}</span>}
            {err && <span className="error">{err}</span>}
          </div>
        )}
      </div>

      {edit && <AnnounceModal value={edit} onClose={() => setEdit(null)} onSave={saqla} />}
    </>
  );
}
