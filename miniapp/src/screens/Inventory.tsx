import { useEffect, useState } from 'react';
import { api, fmt, Product, BASE } from '../api';
import { AppIcon } from '../icons';
import { SubHeader } from '../ui';

// Ombor: barcha mahsulotlar, qoldiq, srok analitikasi

function daysTo(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export default function Inventory({ onBack }: { onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'expiry'>('all');

  useEffect(() => {
    api.products().then(setProducts).catch(() => {});
  }, []);

  const filtered = products.filter((p) => {
    if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'low') return p.stock <= 5;
    if (filter === 'expiry') return p.expiry_date !== null && daysTo(p.expiry_date) <= 7;
    return true;
  });

  const totalValue = products.reduce((s, p) => s + p.stock * p.cost_price, 0);

  return (
    <div className="screen">
      <SubHeader title="Ombor" onBack={onBack} />
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AppIcon glyph="box" color="blue" size={38} />
        <div>
          <div className="hint" style={{ margin: 0 }}>{products.length} xil mahsulot · ombor qiymati</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(totalValue)}</div>
        </div>
      </div>

      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Qidirish..." />
      <div className="chip-row">
        <button className={`chip ${filter === 'all' ? 'selected' : ''}`} onClick={() => setFilter('all')}>Hammasi</button>
        <button className={`chip ${filter === 'low' ? 'selected' : ''}`} onClick={() => setFilter('low')}>Kam qolgan</button>
        <button className={`chip ${filter === 'expiry' ? 'selected' : ''}`} onClick={() => setFilter('expiry')}>Srogi yaqin</button>
      </div>

      <div className="list-group">
        {filtered.map((p) => {
          const expDays = p.expiry_date ? daysTo(p.expiry_date) : null;
          return (
            <div className="list-item" key={p.id}>
              <div className="lead">
                {p.image_url ? (
                  <img src={`${BASE}${p.image_url}`} alt="" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover' }} />
                ) : (
                  <AppIcon glyph="box" color="gray" size={42} />
                )}
                <div>
                  <div className="name">{p.name}</div>
                  <div className="sub">
                    {fmt(p.sell_price)}
                    {expDays !== null && (
                      <span style={{ color: expDays < 0 ? 'var(--red)' : expDays <= 7 ? 'var(--yellow)' : undefined }}>
                        {' '}· srok: {expDays < 0 ? `${-expDays} kun o'tgan!` : `${expDays} kun qoldi`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="amount" style={{ color: p.stock <= 5 ? 'var(--yellow)' : undefined }}>
                {p.stock} {p.unit}
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div className="empty">Mahsulot topilmadi</div>}
    </div>
  );
}
