import { Glyph } from './icons';

// Umumiy UI bo'laklari

export function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '2px 0 12px' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', color: 'var(--accent)', display: 'flex', alignItems: 'center',
          fontSize: 16, padding: '4px 8px 4px 0',
        }}
      >
        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
          <Glyph name="chevron" size={20} />
        </span>
        Orqaga
      </button>
      <div style={{ fontSize: 17, fontWeight: 700, flex: 1, textAlign: 'center', marginRight: 70 }}>{title}</div>
    </div>
  );
}
