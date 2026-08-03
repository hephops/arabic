import { useEffect, useRef, useState } from 'react';
import { Glyph } from './icons';
import { useT } from './i18n';

// Kamera orqali shtrix-kod skaneri.
// Brauzerning BarcodeDetector API'si ishlatiladi (Android/Chrome, Telegram webview).
// Kamera yoki API bo'lmasa — ekran bo'sh qolmaydi: kodni qo'lda kiritish maydoni ochiladi.

type Phase = 'starting' | 'live' | 'manual';

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
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [reason, setReason] = useState('');
  const [flash, setFlash] = useState(false);
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [manual, setManual] = useState('');
  const { t } = useT();
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let zxing: any = null;
    let stopped = false;

    let lastCode = '';
    let lastAt = 0;
    /** Topilgan kodni qayta ishlaydi; true qaytsa — skanerlashni to'xtatamiz */
    function handleCode(code: string): boolean {
      const now = Date.now();
      // bitta kodni ketma-ket qayta o'qib yubormaslik uchun 1.2s pauza
      if (code === lastCode && now - lastAt < 1200) return false;
      lastCode = code;
      lastAt = now;
      navigator.vibrate?.(60);
      setFlash(true);
      setTimeout(() => setFlash(false), 260);
      onScanRef.current(code);
      return !continuous;
    }

    async function start() {
      // Brauzer qoidasi: kamera faqat HTTPS (yoki localhost) da ochiladi.
      // Telefondan http://192.168... orqali kirilsa Safari/Chrome ruxsat so'ramaydi ham.
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setReason(t('scanNeedsHttps'));
        setPhase('manual');
        return;
      }

      // 1-qadam: kamera. Ruxsat bo'lmasa — qo'lda kiritishga o'tamiz.
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (e: any) {
        const kind = e?.name;
        setReason(
          kind === 'NotAllowedError' || kind === 'SecurityError'
            ? t('scanNoPermission')
            : kind === 'NotFoundError' || kind === 'OverconstrainedError'
            ? t('scanNoCamera')
            : kind === 'NotReadableError'
            ? t('scanCameraBusy')
            : t('scanNoPermission')
        );
        setPhase('manual');
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      setHasTorch(!!(track.getCapabilities?.() as any)?.torch);
      setPhase('live');

      // 2-qadam: o'qish dvigateli.
      // Android/Chrome'da brauzerning o'z BarcodeDetector'i — eng tez yo'l.
      const BD = (window as any).BarcodeDetector;
      if (BD) {
        const detector = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0 && handleCode(codes[0].rawValue)) return;
          } catch {
            /* kadr tayyor emas — davom etamiz */
          }
          requestAnimationFrame(tick);
        };
        tick();
        return;
      }

      // iPhone/Safari'da BarcodeDetector yo'q — ZXing kutubxonasi yuklanadi.
      // Faqat shu holatda yuklanadi, shuning uchun asosiy paketni og'irlashtirmaydi.
      try {
        const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library');
        if (stopped) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.QR_CODE,
        ]);
        const reader = new BrowserMultiFormatReader(hints as any, 250);
        zxing = reader;
        reader.decodeFromStream(stream, video, (result: any) => {
          if (stopped || !result) return;
          if (handleCode(result.getText())) {
            reader.reset();
          }
        });
      } catch {
        setReason(t('scanNoSupport'));
        setPhase('manual');
      }
    }

    start();
    return () => {
      stopped = true;
      try {
        zxing?.reset();
      } catch { /* allaqachon to'xtagan */ }
      stream?.getTracks().forEach((tr) => tr.stop());
      trackRef.current = null;
    };
  }, [continuous]);

  function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torch;
    track.applyConstraints({ advanced: [{ torch: next }] } as any).then(
      () => setTorch(next),
      () => setHasTorch(false)
    );
  }

  return (
    <div className={`scan ${flash ? 'flash' : ''}`}>
      <video ref={videoRef} playsInline muted className="scan-video" />
      <div className="scan-shade" />

      <div className="scan-top">
        <div className="scan-title">{t('scanTitle')}</div>
        <div className="scan-tools">
          {hasTorch && (
            <button className={`scan-icon ${torch ? 'on' : ''}`} onClick={toggleTorch} aria-label={t('scanTorch')}>
              <Glyph name="star" size={19} color="#fff" />
            </button>
          )}
          <button className="scan-icon" onClick={onClose} aria-label={t('close')}>
            <Glyph name="close" size={20} color="#fff" />
          </button>
        </div>
      </div>

      {phase !== 'manual' && (
        <div className="scan-window">
          <span className="c tl" />
          <span className="c tr" />
          <span className="c bl" />
          <span className="c br" />
          {phase === 'live' && <span className="scan-line" />}
        </div>
      )}

      <div className="scan-bottom">
        {phase === 'manual' ? (
          <div className="scan-panel">
            <Glyph name="scan" size={26} color="#fff" />
            <div className="scan-reason">{reason}</div>
            <div className="scan-manual">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder={t('scanManual')}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manual.length >= 6) {
                    onScanRef.current(manual);
                    setManual('');
                    if (!continuous) onClose();
                  }
                }}
              />
              <button
                className="scan-add"
                disabled={manual.length < 6}
                onClick={() => {
                  onScanRef.current(manual);
                  setManual('');
                  if (!continuous) onClose();
                }}
              >
                {t('scanAdd')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="scan-hint">{phase === 'starting' ? t('scanStarting') : t('scanHint')}</div>
            {status && <div className="scan-status">{status}</div>}
            <button className="scan-manual-link" onClick={() => setPhase('manual')}>
              {t('scanManual')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
