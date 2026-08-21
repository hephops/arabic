import { useState } from 'react';

// Yuguruvchi e'lon sozlamasi.
//
// Ilovaning tepasida, menyu nomi tagidan o'tib turadigan yozuv. Bitta
// JSON bo'lib "announce" sozlamasida saqlanadi — alohida jadval ochilsa
// har yangi maydon migratsiya talab qilardi.

export interface AnnounceCfg {
  enabled: boolean;
  text: string;
  color: string;
  bg1: string;
  bg2: string;
  size: number;
  weight: 'normal' | 'medium' | 'bold';
  /** to'liq aylanish necha soniyada — kichik son = tezroq */
  speed: number;
  audience: 'all' | 'active' | 'stopped';
}

export const BOSH: AnnounceCfg = {
  enabled: false,
  text: '',
  color: '#ffffff',
  bg1: '#3e97f7',
  bg2: '#6b5cf6',
  size: 14,
  weight: 'bold',
  speed: 22,
  audience: 'all',
};

/** Saqlangan JSON dan sozlamani tiklash — buzuq bo'lsa boshlang'ich holat */
export function parseAnnounce(raw: string): AnnounceCfg {
  try {
    return { ...BOSH, ...(JSON.parse(raw || '{}') as Partial<AnnounceCfg>) };
  } catch {
    return { ...BOSH };
  }
}

const KIMGA = [
  { id: 'all', label: 'Hamma do‘konlarga' },
  { id: 'active', label: 'Faqat faol do‘konlarga' },
  { id: 'stopped', label: 'Faqat to‘xtaganlarga (balans tugagan)' },
];

const SHRIFT = [
  { id: 'normal', label: 'Oddiy' },
  { id: 'medium', label: "O'rtacha" },
  { id: 'bold', label: 'Qalin' },
];

export default function AnnounceModal({
  value,
  onClose,
  onSave,
}: {
  value: AnnounceCfg;
  onClose: () => void;
  onSave: (v: AnnounceCfg) => Promise<void> | void;
}) {
  const [v, setV] = useState<AnnounceCfg>(value);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AnnounceCfg>(k: K, x: AnnounceCfg[K]) => setV((p) => ({ ...p, [k]: x }));

  const preview = v.text.trim() || 'Matn shu yerda ko‘rinadi';

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ fontSize: 24 }}>📣</span>
          <div className="modal-title">Yuguruvchi e'lon</div>
        </div>
        <div className="modal-sub">
          Ilovaning tepasida, bo‘lim nomi tagidan o‘tib turadi
        </div>

        <div className="set-field">
          <label>Kimga ko‘rinsin</label>
          <select value={v.audience} onChange={(e) => set('audience', e.target.value as AnnounceCfg['audience'])}>
            {KIMGA.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </div>

        {/* Jonli ko'rinish — saqlashdan oldin qanday chiqishi ko'rinsin,
            aks holda rang va o'lchamni ko'r-ko'rona tanlashga to'g'ri
            kelardi */}
        <div
          className="ann-preview"
          style={{
            background: `linear-gradient(90deg, ${v.bg1}, ${v.bg2})`,
            color: v.color,
            fontSize: `${v.size}px`,
            fontWeight: v.weight === 'bold' ? 700 : v.weight === 'medium' ? 500 : 400,
          }}
        >
          <div className="ann-run" style={{ animationDuration: `${v.speed}s` }}>
            <span>{preview}</span>
            <span aria-hidden="true">{preview}</span>
          </div>
        </div>

        <div className="set-field">
          <label>Xabar matni</label>
          <textarea
            rows={2}
            value={v.text}
            onChange={(e) => set('text', e.target.value)}
            placeholder="Masalan: 🎉 25-avgust — yangi AI imkoniyatlari qo‘shildi!"
          />
        </div>

        <div className="field-grid">
          <div className="set-field">
            <label>Matn rangi</label>
            <input type="color" value={v.color} onChange={(e) => set('color', e.target.value)} />
          </div>
          <div className="set-field">
            <label>Fon rangi 1</label>
            <input type="color" value={v.bg1} onChange={(e) => set('bg1', e.target.value)} />
          </div>
          <div className="set-field">
            <label>Fon rangi 2</label>
            <input type="color" value={v.bg2} onChange={(e) => set('bg2', e.target.value)} />
          </div>
          <div className="set-field">
            <label>Qalinlik</label>
            <select value={v.weight} onChange={(e) => set('weight', e.target.value as AnnounceCfg['weight'])}>
              {SHRIFT.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="set-field">
            <label>O‘lcham (px)</label>
            <input
              type="number"
              min={10}
              max={24}
              value={v.size}
              onChange={(e) => set('size', Math.min(24, Math.max(10, Number(e.target.value) || 14)))}
            />
          </div>
          <div className="set-field">
            <label>Yugurish tezligi: {v.speed} soniya</label>
            <input
              type="range"
              min={6}
              max={60}
              value={v.speed}
              onChange={(e) => set('speed', Number(e.target.value))}
            />
            <div className="set-hint">Kichik son = tezroq</div>
          </div>
        </div>

        <label className="switch-row">
          <input type="checkbox" checked={v.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          <span>Ilovada ko‘rsatilsin</span>
        </label>
        {v.enabled && !v.text.trim() && (
          <div className="set-hint" style={{ color: 'var(--red)' }}>
            Matn bo‘sh — e‘lon baribir ko‘rinmaydi
          </div>
        )}

        <div className="toolbar" style={{ marginTop: 12 }}>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(v);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Saqlanyapti…' : 'Saqlash'}
          </button>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Bekor</button>
        </div>
      </div>
    </div>
  );
}
