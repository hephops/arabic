import { useState } from 'react';
import { AppIcon, Glyph } from './icons';
import { useT } from './i18n';
import { haptic } from './telegram';
import type { Tab } from './App';

// Tezkor amallar — istalgan ekrandan ikki bosishda:
// suzuvchi tugma → uchta asosiy amal (sotuv, qarz yozish, tovar kirimi).

const ACTIONS: { tab: Tab; glyph: string; key: string; mode?: 'sale' | 'intake' }[] = [
  { tab: 'kassa', glyph: 'cart', key: 'modeSale', mode: 'sale' },
  { tab: 'add', glyph: 'note', key: 'tabAdd' },
  { tab: 'kassa', glyph: 'boxes', key: 'modeIntake', mode: 'intake' },
];

export default function QuickActions({ onPick }: { onPick: (tab: Tab, mode?: 'sale' | 'intake') => void }) {
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
                onPick(a.tab, a.mode);
              }}
            >
              <AppIcon glyph={a.glyph} size={38} />
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
