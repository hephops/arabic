import { useEffect, useRef, useState } from 'react';
import { Glyph } from './icons';
import { useT } from './i18n';

// Kamera orqali shtrix-kod skaneri.
// Brauzerning o'zidagi BarcodeDetector API ishlatiladi (Android/Chrome, Telegram webview).
// Qo'llamaydigan qurilmada (eski iOS Safari) qo'lda kiritishga yo'naltiradi.

export default function Scanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const { t } = useT();

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
      const tick = async () => {
        if (stopped) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0) {
            navigator.vibrate?.(80);
            onScan(codes[0].rawValue);
            return;
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
  }, [onScan]);

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
      <p style={{ position: 'absolute', bottom: 110, width: '100%', textAlign: 'center', color: '#fff', fontSize: 14 }}>
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
