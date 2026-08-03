import { useEffect, useState } from 'react';
import { api, logout, Shop } from '../api';

export default function Profile({ onLogout }: { onLogout: () => void }) {
  const [shop, setShop] = useState<Shop | null>(null);

  useEffect(() => {
    api.me().then(setShop).catch(() => {});
  }, []);

  if (!shop) return <div className="screen empty">Yuklanmoqda...</div>;

  return (
    <div className="screen">
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Do'kon</div>
        <div className="name" style={{ fontSize: 17, fontWeight: 700 }}>{shop.name}</div>
        <p className="hint">{shop.phone}</p>
        <p className="hint">Tarif: {shop.plan === 'free' ? 'Bepul' : shop.plan}</p>
        <p className="hint">Karta: {shop.card_number ?? 'kiritilmagan'}</p>
      </div>
      <button className="btn-ghost" onClick={() => { logout(); onLogout(); }}>
        Chiqish
      </button>
    </div>
  );
}
