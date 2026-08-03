import { useEffect, useState } from 'react';
import { AppIcon, Glyph } from './icons';
import { useT } from './i18n';
import { inTelegram } from './telegram';

// "Ekranga qo'shish" taklifi — brauzerda ochilganda chiqadi.
// Telegram ichida yoki allaqachon o'rnatilgan bo'lsa ko'rinmaydi.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'install-dismissed';

export default function InstallPrompt() {
  const { t } = useT();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    if (inTelegram) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    // allaqachon ilova sifatida ochilgan bo'lsa
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS Safari beforeinstallprompt'ni qo'llamaydi — qo'lda ko'rsatma beramiz
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (isIos && isSafari) {
      const timer = setTimeout(() => setShowIos(true), 4000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', onPrompt);
      };
    }
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDeferred(null);
    setShowIos(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!deferred && !showIos) return null;

  return (
    <div className="install-banner">
      <AppIcon glyph="house" size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="name">{t('installTitle')}</div>
        <div className="sub">{showIos ? t('installIosHint') : t('installHint')}</div>
      </div>
      {!showIos && (
        <button className="chip selected" onClick={install}>
          {t('installBtn')}
        </button>
      )}
      <button className="install-close" onClick={dismiss} aria-label={t('close')}>
        <Glyph name="close" size={18} color="var(--muted)" />
      </button>
    </div>
  );
}
