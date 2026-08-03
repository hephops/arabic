import { useEffect, useState } from 'react';
import { Glyph } from './icons';
import { haptic } from './telegram';

// Qisqa xabarlar: "qo'shildi", "topildi", "topilmadi" kabi.
// Ekran tepasida, navigatsiya panelining ostida chiqadi va o'zi yo'qoladi —
// sotuv paytida qo'l pastda bo'lgani uchun yuqori joy ko'rinadigan joy.

export type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  sub?: string;
}

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();
let counter = 0;

function show(kind: ToastKind, text: string, sub?: string) {
  const item: Toast = { id: ++counter, kind, text, sub };
  listeners.forEach((l) => l(item));
  if (kind === 'success') haptic.success();
  else if (kind === 'error') haptic.error();
  else haptic.tap();
}

export const toast = {
  success: (text: string, sub?: string) => show('success', text, sub),
  error: (text: string, sub?: string) => show('error', text, sub),
  info: (text: string, sub?: string) => show('info', text, sub),
};

const ICON: Record<ToastKind, string> = { success: 'check', error: 'warning', info: 'search' };

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: Listener = (t) => {
      setItems((prev) => {
        // Bir xil xabar ketma-ket chiqsa (masalan "+" tugmasi tez bosilsa) —
        // takrorlanmaydi, eskisi yangisi bilan almashadi.
        const same = prev.filter((x) => !(x.text === t.text && x.sub === t.sub));
        // bir vaqtda ko'pi bilan uchtasi ko'rinadi
        return [...same.slice(-2), t];
      });
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 2600);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toast-host">
      {items.map((t) => (
        <div className={`toast ${t.kind}`} key={t.id} onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))}>
          <span className="toast-icon">
            <Glyph name={ICON[t.kind]} size={15} color="#fff" />
          </span>
          <div className="toast-body">
            <div className="toast-text">{t.text}</div>
            {t.sub && <div className="toast-sub">{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
