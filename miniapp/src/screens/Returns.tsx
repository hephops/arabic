import { NavBar } from '../ui';
import { useT } from '../i18n';
import { HistoryMode } from './History';

// Menyudagi "Qaytarish" bandi.
//
// Kassa → Tarix bilan bir xil ekran, faqat skaner darhol ochiladi:
// mijoz tovarni ko'tarib kelganda do'konchi menyudan bir bosib,
// tovarni skanerlaydi — cheki o'zi topiladi. Chek raqami esida
// bo'lishi shart emas, ro'yxat varaqlash ham kerak emas.

export default function Returns({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  return (
    <>
      <NavBar title={t('navReturns')} onBack={onBack} />
      <div className="screen">
        <HistoryMode autoScan />
      </div>
    </>
  );
}
