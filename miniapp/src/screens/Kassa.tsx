import { useState } from 'react';
import { api, fmt, Product } from '../api';

interface CartLine {
  product: Product;
  qty: number;
}

export default function Kassa({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<'cash' | 'card' | 'debt'>('cash');
  const [customerName, setCustomerName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    // raqam bo'lsa shtrix-kod deb qidiramiz (skaner klaviatura kabi yozadi)
    const isBarcode = /^\d{6,}$/.test(q.trim());
    const found = await api.products(isBarcode ? { barcode: q.trim() } : { q });
    setResults(found.filter((p) => p.id !== null));
  }

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) return prev.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { product: p, qty: 1 }];
    });
    setQuery('');
    setResults([]);
  }

  function changeQty(id: number, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.product.id === id ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }

  const total = cart.reduce((s, l) => s + l.product.sell_price * l.qty, 0);

  async function checkout() {
    setError('');
    if (payment === 'debt' && !customerName.trim()) {
      setError("Qarzga sotishda mijoz ismi kerak");
      return;
    }
    try {
      await api.createSale({
        items: cart.map((l) => ({ product_id: l.product.id!, qty: l.qty })),
        payment_type: payment,
        customer_name: payment === 'debt' ? customerName.trim() : undefined,
      });
      setMessage(`✅ Sotuv saqlandi: ${fmt(total)}${payment === 'debt' ? ' (qarz daftariga yozildi)' : ''}`);
      setCart([]);
      setCustomerName('');
      onDone();
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
    }
  }

  return (
    <div className="screen">
      <div className="section-title">Kassa</div>
      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="🔍 Mahsulot nomi yoki shtrix-kod..."
      />
      {results.map((p) => (
        <div className="list-item" key={p.id} onClick={() => addToCart(p)}>
          <div>
            <div className="name">{p.name}</div>
            <div className="sub">qoldiq: {p.stock} {p.unit}</div>
          </div>
          <div className="amount">{fmt(p.sell_price)}</div>
        </div>
      ))}

      {cart.length > 0 && (
        <>
          <div className="section-title">Savat</div>
          {cart.map((l) => (
            <div className="list-item" key={l.product.id}>
              <div>
                <div className="name">{l.product.name}</div>
                <div className="sub">{fmt(l.product.sell_price)} × {l.qty}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="chip" onClick={() => changeQty(l.product.id!, -1)}>−</button>
                <span>{l.qty}</span>
                <button className="chip" onClick={() => changeQty(l.product.id!, 1)}>+</button>
              </div>
            </div>
          ))}
          <div className="big-amount">{fmt(total)}</div>
          <div className="chip-row">
            {(
              [
                ['cash', '💵 Naqd'],
                ['card', '💳 Karta'],
                ['debt', '📒 Qarzga'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`chip ${payment === id ? 'selected' : ''}`}
                onClick={() => setPayment(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {payment === 'debt' && (
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Mijoz ismi (qarz daftariga yoziladi)"
            />
          )}
          <button className="btn-primary" onClick={checkout}>
            ✅ Sotuvni yakunlash
          </button>
        </>
      )}
      {cart.length === 0 && !results.length && (
        <div className="empty">Mahsulot qidiring yoki skaner qiling</div>
      )}
      {message && <p className="hint center">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
