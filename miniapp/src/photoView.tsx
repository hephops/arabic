import { useEffect, useState } from 'react';
import { Glyph } from './icons';
import { useEscape } from './useEscape';
import { BASE } from './api';

/* ─────────── Rasmni kattalashtirib ko'rish ───────────
 *
 * Ro'yxatdagi rasm 44 piksel: do'konchi undan uzukning ko'zini ham,
 * kiyimning naqshini ham ajrata olmaydi. Bosilganda esa rasm butun
 * ekranga ochilsin — mijoz "o'sha uzukmi?" deb so'raganda javob
 * shu yerda.
 *
 * Toast kabi buyruq bilan ochiladi (`openPhoto(...)`): rasm ro'yxatda
 * ham, chekda ham, kassada ham uchraydi — har ekranga alohida holat
 * qo'shish uzun zanjir bo'lardi. */

interface Photo {
  url: string;
  alt: string;
}

type Listener = (p: Photo | null) => void;
const listeners = new Set<Listener>();

/** Rasmni to'liq ekranda ochish. `url` — serverdagi yo'l yoki to'liq havola. */
export function openPhoto(url: string | null | undefined, alt = '') {
  const s = String(url ?? '').trim();
  if (!s) return;
  listeners.forEach((l) => l({ url: s.startsWith('http') || s.startsWith('data:') ? s : `${BASE}${s}`, alt }));
}

export function PhotoViewer() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  useEscape(() => setPhoto(null), !!photo);

  useEffect(() => {
    const listener: Listener = (p) => setPhoto(p);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  if (!photo) return null;
  return (
    // Fonning istalgan joyi bosilsa yopiladi — telefonda "×" ni
    // aniq bosish qiyin, ayniqsa bir qo'l bilan
    <div className="photo-view" onClick={() => setPhoto(null)}>
      <button className="photo-x" aria-label="×" onClick={() => setPhoto(null)}>
        <Glyph name="close" size={20} color="#fff" />
      </button>
      {/* Rasmning o'zi bosilganda yopilmaydi: do'konchi uni yaqinroq
          ko'rmoqchi bo'lib bosishi mumkin */}
      <img src={photo.url} alt={photo.alt} onClick={(e) => e.stopPropagation()} />
      {photo.alt && <div className="photo-cap">{photo.alt}</div>}
    </div>
  );
}
