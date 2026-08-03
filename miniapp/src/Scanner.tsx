import { useEffect, useRef, useState } from 'react';
import { Glyph } from './icons';
import { useT } from './i18n';

// Kamera orqali shtrix-kod skaneri.
// Brauzerning o'zidagi BarcodeDetector API ishlatiladi (Android/Chrome, Telegram webview).
// Qo'llamaydigan qurilmada (eski iOS Safari) qo'lda kiritishga yo'naltiradi.

export default function Scanner({
  onScan,
  onClose,
  continuous = false,
  status,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
  /** true — skaner yopilmaydi, ketma-ket skanerlash mumkin */
  continuous?: boolean;
  /** ekran pastida ko'rinadigan holat (masalan savat summasi) */
  status?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const { t } = useT();
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    async function start() {
      const BD = (window as any).BarcodeDetector;
      if (!BD) {
        setError(t('scanNoSupport'));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch {
        setError(t('scanNoPermission'));
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const detector = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] });
      let lastCode = '';
      let lastAt = 0;
      const tick = async () => {
        if (stopped) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0) {
            const code = codes[0].rawValue;
            const now = Date.now();
            // bitta kodni ketma-ket qayta o'qib yubormaslik uchun 1.2s pauza
            if (code !== lastCode || now - lastAt > 1200) {
              lastCode = code;
              lastAt = now;
              navigator.vibrate?.(60);
              onScanRef.current(code);
              if (!continuous) return;
            }
          }
        } catch {
          /* kadr tayyor emas — davom etamiz */
        }
        requestAnimationFrame(tick);
      };
      tick();
    }

    start();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [continuous]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: '#000',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <video ref={videoRef} playsInline muted style={{ flex: 1, objectFit: 'cover', width: '100%' }} />
      {/* nishon ramkasi */}
      <div
        style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 260, height: 150, border: '3px solid #fff', borderRadius: 16,
          boxShadow: '0 0 0 100vmax rgba(0,0,0,0.45)',
        }}
      />
      {status && (
        <div
          style={{
            position: 'absolute', bottom: 96, left: 16, right: 16,
            background: 'rgba(255,255,255,0.95)', color: '#000', borderRadius: 14,
            padding: '11px 14px', fontSize: 15, fontWeight: 600, textAlign: 'center',
          }}
        >
          {status}
        </div>
      )}
      <p
        style={{
          position: 'absolute', bottom: status ? 152 : 110, width: '100%',
          textAlign: 'center', color: '#fff', fontSize: 14,
        }}
      >
        {error || t('scanHint')}
      </p>
      <button
        onClick={onClose}
        style={{
          position: 'absolute', bottom: 34, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.92)', color: '#1c1c1e', padding: '13px 34px',
          borderRadius: 24, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15,
        }}
      >
<Glyph name="close" size={18} /> {t('close')}
      </button>
    </div>
  );
}
