import { useState } from 'react';
import { AppIcon, Glyph } from './icons';
import { useT } from './i18n';
import { haptic } from './telegram';
import type { Tab, SubScreen } from './App';

// Tezkor amallar — istalgan ekrandan ikki bosishda:
// suzuvchi tugma → kunlik asosiy amallar.
//
// Qaytarish shu yerda turishi muhim: mijoz tovarni ko'tarib kelganda
// do'konchi qaysi ekranda turgani noma'lum, "+" esa hamma joyda
// ko'rinib turadi. Bosilganda skaner darhol ochiladi.

const ACTIONS: { tab?: Tab; sub?: SubScreen; glyph: string; color?: string; key: string; mode?: 'sale' | 'intake'; scan?: boolean }[] = [
  // Sotuv skaner bilan ochiladi: do'konchi "+" ni bosgan payt qo'lida
  // allaqachon tovar turadi, qidiruv maydoni emas skaner kerak
  { tab: 'kassa', glyph: 'cart', key: 'modeSale', mode: 'sale', scan: true },
  { tab: 'add', glyph: 'note', key: 'tabAdd' },
  { tab: 'kassa', glyph: 'boxes', key: 'modeIntake', mode: 'intake' },
  { sub: 'returns', glyph: 'arrowDown', color: 'red', key: 'navReturns', scan: true },
];

export default function QuickActions({
  onPick,
}: {
  onPick: (target: { tab?: Tab; sub?: SubScreen; scan?: boolean }, mode?: 'sale' | 'intake') => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useT();

  return (
    <>
      {open && <div className="qa-backdrop" onClick={() => setOpen(false)} />}

      {open && (
        <div className="qa-sheet">
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              className="qa-item"
              onClick={() => {
                haptic.tap();
                setOpen(false);
                onPick({ tab: a.tab, sub: a.sub, scan: a.scan }, a.mode);
              }}
            >
              <AppIcon glyph={a.glyph} color={a.color} size={38} />
              <span>{t(a.key)}</span>
            </button>
          ))}
        </div>
      )}

      <button
        className={`fab-quick ${open ? 'open' : ''}`}
        onClick={() => {
          haptic.tap();
          setOpen(!open);
        }}
        aria-label={t('quickActions')}
      >
        <Glyph name={open ? 'close' : 'plus'} size={26} color="#fff" />
      </button>
    </>
  );
}
