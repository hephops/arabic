import { useEffect, useMemo, useState } from 'react';
import { api, fmt, fmtNum, fmtPhone, type AiReport } from '../api';
import { AppIcon } from '../icons';

// AI bo'limi: tannarx, tushum va savollar soni bir joyda.
//
// Panel kartasi faqat 30 kunlik yig'indini ko'rsatadi — bu yerda esa
// dinamikasi bilan turadi, chunki asosiy savol "qancha ketdi" emas,
// "o'sib boryaptimi va narx tannarxni qoplayaptimi" degani.

const DAVRLAR = [
  { kun: 7, nom: '7 kun' },
  { kun: 30, nom: '30 kun' },
  { kun: 90, nom: '90 kun' },
  { kun: 0, nom: 'Butun vaqt' },
];

/** Kun sanasini qisqa ko'rinishda: 2026-08-21 -> 21.08 */
const kunLabel = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;

export default function Ai() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState<AiReport | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setR(null);
    setErr('');
    api.aiReport(days).then(setR).catch((e) => setErr(e.message ?? 'Yuklab bo\'lmadi'));
  }, [days]);

  // Diagramma uchun eng baland ustun: tannarx va tushumning kattasi
  const eng = useMemo(
    () => Math.max(1, ...(r?.kunlar ?? []).map((k) => Math.max(k.tannarx, k.tushum))),
    [r]
  );
  // Savollar diagrammasi alohida o'lchovda
  const engSavol = useMemo(
    () => Math.max(1, ...(r?.kunlar ?? []).map((k) => k.savollar)),
    [r]
  );

  if (err) return <div className="panel"><div className="err-msg">{err}</div></div>;
  if (!r) return <div className="panel">Yuklanmoqda...</div>;

  const farq = r.jami.tushum - r.jami.tannarx;
  // "Narxni qo'ysam qancha bo'lardi" — narx 0 bo'lganda ham ko'rinsin
  const kutilgan = r.narx * r.jami.savollar;

  return (
    <>
      {/* Butun vaqt bo'yicha — bu raqamlar davr tanlovidan o'zgarmaydi */}
      <div className="stats">
        <div className="stat">
          <AppIcon glyph="sparkle" size={38} />
          <div className="txt">
            <div className="k">Jami tannarx</div>
            <div className="v red">{fmt(r.jami.tannarx)}</div>
            <div className="sub">butun vaqt · {fmtNum(r.jami.chaqiruvlar)} chaqiruv</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="banknote" size={38} />
          <div className="txt">
            <div className="k">Jami tushum</div>
            <div className="v green">{fmt(r.jami.tushum)}</div>
            <div className="sub">
              {r.narx > 0
                ? `savol narxi ${fmt(r.narx)}`
                : 'savol hozir BEPUL — narx Sozlamalarda qo\'yiladi'}
            </div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="chart" size={38} />
          <div className="txt">
            <div className="k">Farq</div>
            <div className={`v ${farq >= 0 ? 'green' : 'red'}`}>{fmt(farq)}</div>
            <div className="sub">tushum − tannarx</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="note" size={38} />
          <div className="txt">
            <div className="k">Jami savollar</div>
            <div className="v accent">{fmtNum(r.jami.savollar)}</div>
            <div className="sub">{fmtNum(r.jami.dokonlar)} do'kon so'ragan</div>
          </div>
        </div>
        {/* Narx qo'yishdagi asosiy raqam: bittasi qanchaga tushyapti */}
        <div className="stat">
          <AppIcon glyph="banknote" size={38} />
          <div className="txt">
            <div className="k">Bitta savolning tannarxi</div>
            <div className="v">{fmt(r.jami.ortacha)}</div>
            <div className="sub">
              {r.narx > 0
                ? r.narx >= r.jami.ortacha
                  ? `narx ${fmt(r.narx)} — qoplayapti`
                  : `narx ${fmt(r.narx)} — QOPLAMAYAPTI`
                : `narx ${fmt(r.jami.ortacha)} bo'lsa nolga chiqardi`}
            </div>
          </div>
        </div>
        {/* Narx 0 bo'lsa ham nechaga chiqishi ko'rinib tursin */}
        <div className="stat">
          <AppIcon glyph="star" size={38} />
          <div className="txt">
            <div className="k">Hozirgi narxda tushum</div>
            <div className="v accent">{fmt(kutilgan)}</div>
            <div className="sub">
              {r.narx > 0 ? 'shu narx boshidan bo\'lganda' : 'narx 0 — shuning uchun 0'}
            </div>
          </div>
        </div>
      </div>

      {/* Davr tanlovi — pastdagi hamma narsa shunga qarab o'zgaradi */}
      <div className="panel">
        <div className="panel-title">
          Kunlik dinamika
          <span className="seg">
            {DAVRLAR.map((d) => (
              <button
                key={d.kun}
                className={`seg-item ${days === d.kun ? 'on' : ''}`}
                onClick={() => setDays(d.kun)}
              >
                {d.nom}
              </button>
            ))}
          </span>
        </div>

        <div className="legend">
          <span><i className="dot red" /> tannarx</span>
          <span><i className="dot green" /> tushum</span>
        </div>

        {r.kunlar.length === 0 ? (
          <div className="empty">Bu davrda ma'lumot yo'q</div>
        ) : (
          <div className="chart chart-pair">
            {r.kunlar.map((k) => (
              <div className="col" key={k.sana} title={`${k.sana}\ntannarx ${fmt(k.tannarx)}\ntushum ${fmt(k.tushum)}\n${k.savollar} savol`}>
                <div className="pair">
                  <div className="bar red" style={{ height: `${(k.tannarx / eng) * 100}%` }} />
                  <div className="bar green" style={{ height: `${(k.tushum / eng) * 100}%` }} />
                </div>
                <div className="lbl">{kunLabel(k.sana)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="sum-row">
          <span>Davr bo'yicha: <b className="red">{fmt(r.davr.tannarx)}</b> tannarx</span>
          <span><b className="green">{fmt(r.davr.tushum)}</b> tushum</span>
          <span><b>{fmtNum(r.davr.savollar)}</b> savol</span>
          <span><b>{fmtNum(r.davr.dokonlar)}</b> do'kon</span>
        </div>
      </div>

      {/* Savollar soni alohida: pul emas, YUK dinamikasi ko'rinsin */}
      <div className="panel">
        <div className="panel-title">Kuniga nechta savol</div>
        {r.kunlar.length === 0 ? (
          <div className="empty">Ma'lumot yo'q</div>
        ) : (
          <div className="chart">
            {r.kunlar.map((k) => (
              <div className="col" key={k.sana} title={`${k.sana} — ${k.savollar} savol, ${k.chaqiruvlar} chaqiruv`}>
                <div className="bar" style={{ height: `${(k.savollar / engSavol) * 100}%` }} />
                <div className="lbl">{kunLabel(k.sana)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kim qancha ishlatyapti — narx qo'yishda va suiiste'molni
          ko'rishda kerak bo'ladi */}
      <div className="panel">
        <div className="panel-title">Do'konlar bo'yicha</div>
        {r.dokonlar.length === 0 ? (
          <div className="empty">Bu davrda hech kim ishlatmagan</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Do'kon</th>
                <th className="num">Savol</th>
                <th className="num">Chaqiruv</th>
                <th className="num">Tannarx</th>
                <th className="num">Tushum</th>
                <th className="num">Farq</th>
              </tr>
            </thead>
            <tbody>
              {r.dokonlar.map((d) => (
                <tr key={d.shop_id}>
                  <td>
                    <div className="nm">{d.nom || '—'}</div>
                    <div className="sub">{fmtPhone(d.telefon)}</div>
                  </td>
                  <td className="num">{fmtNum(d.savollar)}</td>
                  <td className="num">{fmtNum(d.chaqiruvlar)}</td>
                  <td className="num red">{fmt(d.tannarx)}</td>
                  <td className="num green">{fmt(d.tushum)}</td>
                  <td className={`num ${d.tushum - d.tannarx >= 0 ? 'green' : 'red'}`}>
                    {fmt(d.tushum - d.tannarx)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modellar: qaysi biri qancha yeyapti. Model almashtirilganda
          ta'siri shu yerda darrov ko'rinadi. */}
      {r.modellar.length > 0 && (
        <div className="panel">
          <div className="panel-title">Modellar bo'yicha</div>
          <table className="tbl">
            <thead>
              <tr><th>Model</th><th className="num">Chaqiruv</th><th className="num">Tannarx</th></tr>
            </thead>
            <tbody>
              {r.modellar.map((m) => (
                <tr key={m.model}>
                  <td>{m.model}</td>
                  <td className="num">{fmtNum(m.chaqiruvlar)}</td>
                  <td className="num red">{fmt(m.tannarx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sum-row">
            <span>Kirish: <b>{fmtNum(r.jami.kirish_token)}</b> token</span>
            <span>Chiqish: <b>{fmtNum(r.jami.chiqish_token)}</b> token</span>
            <span>Keshdan: <b>{fmtNum(r.jami.keshdan_token)}</b> token</span>
          </div>
        </div>
      )}
    </>
  );
}
