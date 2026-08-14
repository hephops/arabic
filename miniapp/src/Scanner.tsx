import { useEffect, useRef, useState } from 'react';
import {
  MultiFormatReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource,
  DecodeHintType, BarcodeFormat,
} from '@zxing/library';
import { Glyph } from './icons';
import { useT } from './i18n';
import { createVoter } from './barcode';

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
  const [seen, setSeen] = useState('');
  // Nima bo'layotganini ekranda ko'rsatish uchun (qaysi dvigatel ishlayapti,
  // kadrlar o'qilyaptimi). Skaner "ishlamayapti" deganda sabab shu yerda ko'rinadi.
  const [diag, setDiag] = useState('kamera kutilmoqda');
  const { t } = useT();
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let zxing: any = null;
    let stopped = false;
    let timer = 0;

    let lastCode = '';
    let lastAt = 0;
    const voter = createVoter();

    /**
     * Kadrdan o'qilgan kod. Bitta kadrga ishonmaymiz: nazorat raqami
     * buzuq bo'lsa tashlab yuboriladi, to'g'ri bo'lsa ham bir necha marta
     * bir xil o'qilishi kutiladi. true qaytsa — skanerlash to'xtaydi.
     */
    function handleCode(raw: string, selfValidating = false): boolean {
      const code = voter.push(raw, selfValidating);
      if (!code) return false;

      const now = Date.now();
      // bitta kodni ketma-ket qayta o'qib yubormaslik uchun 1.2s pauza
      if (code === lastCode && now - lastAt < 1200) return false;
      lastCode = code;
      lastAt = now;
      setSeen(code);
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
      // Qurilma qo'llab-quvvatlamasa oddiy so'rovga qaytamiz.
      //
      // 1280 ataylab: 1920 ham sinab ko'rildi va foyda bermadi (kadr
      // o'qishdan oldin baribir kichraytirilgani uchun ortiqcha piksellar
      // yo'qoladi, ba'zi holatda esa natija yomonlashdi). O'lchovlar
      // shuni ko'rsatdi: hal qiluvchi narsa o'lcham emas, rasmning
      // aniqligi (fokus) — xira kadrni hech qanday o'lcham qutqarmaydi.
      const ideal: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          advanced: [{ focusMode: 'continuous' } as any],
        } as any,
      };
      try {
        stream = await navigator.mediaDevices
          .getUserMedia(ideal)
          .catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }));
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
      setDiag('dvigatel tanlanmoqda');

      // iPhone/Safari'da BarcodeDetector yo'q, ba'zi Android qurilmalarda esa
      // (masalan Google xizmatlari to'liq bo'lmagan telefonlarda) mavjud bo'lib
      // ko'rinsa ham har doim xato qaytaradi — shu holatlarning barchasi uchun
      // ZXing kutubxonasiga (sof JS, qurilmaga bog'liq emas) tushamiz.
      function startZxing() {
        // ZXing ataylab oddiy (statik) import qilinadi.
        //
        // Avval u `await import('@zxing/library')` orqali alohida ~400 KB
        // fayl sifatida yuklanardi. Sekin mobil internetda (LTE) o'sha fayl
        // yetib kelmay, so'rov muzlab qolardi: kamera ochiq, ko'k chiziq
        // yurib turadi, lekin o'qish sikli UMUMAN boshlanmaydi va xato ham
        // chiqmaydi (so'rov rad etilmaydi, shunchaki tugamaydi). Endi
        // kutubxona asosiy fayl ichida keladi — kutiladigan narsa yo'q.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new MultiFormatReader();
        const qrFormat: any = BarcodeFormat.QR_CODE;

        // Kadrni o'zimiz tayyorlaymiz. ZXing'ning o'z brauzer qatlami butun
        // kadrni (720x1280) o'zi canvas'ga chizadi — u yerda Safari'ning
        // video burilishi/cho'zilishi bilan bog'liq muammolari bor va
        // shtrix-kod gorizontal siqilib, o'qib bo'lmaydigan holga kelishi
        // mumkin. Bu yerda drawImage'ni aniq koordinatalar bilan o'zimiz
        // chaqiramiz — hech qanday noaniqlik qolmaydi.
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

        // Har kadrda yangi massiv yaratilsa, zaif telefonda xotira tozalash
        // (GC) sekinlashtiradi. Shuning uchun har o'lcham uchun bitta bufer
        // yasab, uni qayta ishlatamiz.
        const buffers = new Map<number, Int32Array>();

        /** Kadrning berilgan qismini kesib, kattalashtirib o'qishga uriniladi */
        function decodeRegion(sx: number, sy: number, sw: number, sh: number, outW: number) {
          const outH = Math.max(1, Math.round((sh / sw) * outW));
          canvas.width = outW;
          canvas.height = outH;
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
          const { data } = ctx.getImageData(0, 0, outW, outH);
          const n = outW * outH;
          let lum = buffers.get(n);
          if (!lum) {
            lum = new Int32Array(n);
            buffers.set(n, lum);
          }
          for (let i = 0; i < n; i++) {
            const p = i * 4;
            lum[i] = (0xff << 24) | (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
          }
          const bitmap = new BinaryBitmap(
            new HybridBinarizer(new RGBLuminanceSource(lum, outW, outH))
          );
          try {
            return reader.decode(bitmap, hints as any);
          } catch {
            return null; // bu qismda kod yo'q
          } finally {
            reader.reset();
          }
        }

        // Kadrlarni ZXing'ning o'ziga qo'yib bermay, o'zimiz beramiz.
        //
        // Sabab (iPhone'da skaner umuman o'qimasligining asosiy sababi):
        // reader.decodeFromStream() ichida videoni o'zi ishga tushirmoqchi
        // bo'ladi va 'playing' hodisasini kutadi. Biz esa yuqorida videoni
        // allaqachon o'ynatib qo'yganmiz — shu sabab ZXing "video allaqachon
        // o'ynayapti" deb play() ni chaqirmaydi, 'playing' esa qaytadan
        // yuzaga kelmaydi. Natijada u kutgan promise hech qachon bajarilmaydi
        // va o'qish sikli UMUMAN boshlanmaydi: kamera ko'rinib turadi,
        // ko'k chiziq ham yurib turadi (u shunchaki CSS animatsiya), lekin
        // hech narsa o'qilmaydi. Android'da BarcodeDetector bor bo'lgani
        // uchun bu yo'lga tushilmaydi — shuning uchun ba'zi telefonlarda
        // ishlab, iPhone'da (Safari'da BarcodeDetector yo'q) ishlamasdi.
        let frames = 0;
        let lastErr = '';
        let took = 0;
        // Har aylanishda bitta joyni o'qiymiz, navbat bilan almashtirib:
        // avval mo'ljal ramkasi atrofidagi tasma (kod odatda shu yerda,
        // kesib kattalashtirilgani uchun eng aniq o'qiladi), keyin butun
        // kadr (kod ramkadan chetda qolsa ham topilsin). Ikkalasini bitta
        // aylanishda qilish zaif telefonni ikki barobar sekinlashtirardi —
        // navbatlashtirsak, qamrov bir xil qoladi, tezlik esa ikki barobar.
        let turn = 0;
        const loop = () => {
          if (stopped) return;
          const t0 = performance.now();
          // Safari ba'zan avtomatik ijroni rad etadi (yoki ilova fonga
          // o'tib qaytganda video to'xtab qoladi) — shunda kadr yangilanmay,
          // sikl bo'sh aylanaverardi. Shuning uchun har safar tekshiramiz.
          if (video.paused) video.play().catch(() => {});
          // videoWidth 0 bo'lsa kadr hali tayyor emas — canvas bo'sh chiqadi
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (vw > 0) {
            frames++;
            try {
              let result;
              if (turn % 2 === 0) {
                // Ramka ekranning 44% balandligida turadi
                const bandH = Math.round(vh * 0.34);
                const bandY = Math.max(0, Math.round(vh * 0.44 - bandH / 2));
                result = decodeRegion(0, bandY, vw, Math.min(bandH, vh - bandY), 1000);
              } else {
                result = decodeRegion(0, 0, vw, vh, 800);
              }
              turn++;
              if (result && handleCode(result.getText(), result.getBarcodeFormat() === qrFormat)) {
                return;
              }
            } catch (err: any) {
              // Bu yerga faqat kutilmagan xato tushadi (kod topilmasligi
              // decodeRegion ichida null bilan qaytariladi) — uni ko'rsatamiz,
              // aks holda sikl jimgina aylanaveradi va sabab bilinmaydi.
              lastErr = err?.name || 'xato';
            }
            took = performance.now() - t0;
          }
          if (frames % 8 === 0) {
            setDiag(
              `ZXing · ${vw}x${vh} · ${frames} kadr · ${Math.round(took)}ms` +
                (lastErr ? ` · ${lastErr}` : '')
            );
          }
          // Zaif telefonda o'qish uzoq davom etsa, ustiga yana yuk qo'ymaymiz:
          // keyingi urinishgacha kamida shuncha vaqt dam beramiz. Aks holda
          // brauzer navbatga tiqilib, ekran ham qotib qoladi.
          timer = window.setTimeout(loop, Math.min(400, Math.max(60, Math.round(took))));
        };
        loop();
      }

      // 2-qadam: o'qish dvigateli.
      // Android/Chrome'da brauzerning o'z BarcodeDetector'i — eng tez yo'l.
      // ITF ataylab yo'q: u kodning bir qismini ham "o'qib" noto'g'ri
      // qisqa raqam qaytarishi mumkin
      const BD = (window as any).BarcodeDetector;
      let detector: any = null;
      if (BD) {
        try {
          detector = new BD({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
          });
        } catch {
          detector = null; // shu qurilmada bu format ro'yxati qo'llab-quvvatlanmaydi
        }
      }

      if (detector) {
        // Ba'zi qurilmalarda (masalan Google xizmatlari to'liq bo'lmagan
        // telefonlarda) BarcodeDetector xato ham qaytarmaydi — shunchaki
        // doim bo'sh natija beradi. Shuning uchun xatoga emas, vaqtga
        // qaraymiz: bir necha soniya hech narsa topilmasa (kod aniq
        // kadrga tushgan bo'lsa ham), ZXing'ga o'tamiz.
        //
        // Muhim: fallback faqat detektor HECH NARSA topmagandagina
        // ishga tushishi kerak. Avval "continuous" rejimda faqat
        // yakuniy (tasdiqlangan) kodda tozalanardi — shu sabab uzluksiz
        // skanerlashda (masalan kassada) detektor yaxshi ishlab turgan
        // bo'lsa ham 4 soniyadan keyin har doim og'irroq ZXing'ga
        // o'tib ketardi va ekran bir lahza qotib qolgandek ko'rinardi.
        // Endi har qanday (hatto hali tasdiqlanmagan) o'qishda ham
        // fallback bekor qilinadi — detektor ishlayotganini bilish
        // uchun shunchaki bitta o'qish yetarli.
        let switched = false;
        let frames = 0;
        const fallback = setTimeout(() => {
          if (stopped || switched) return;
          switched = true;
          startZxing();
        }, 4000);
        const tick = async () => {
          if (stopped || switched) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0) {
              clearTimeout(fallback);
              if (handleCode(codes[0].rawValue, codes[0].format === 'qr_code')) return;
            }
          } catch {
            /* bu kadrda topilmadi — davom etamiz, tayanch vaqt hal qiladi */
          }
          frames++;
          if (frames % 15 === 0) {
            setDiag(`BarcodeDetector · ${video.videoWidth}x${video.videoHeight} · ${frames} kadr`);
          }
          requestAnimationFrame(tick);
        };
        tick();
        return;
      }

      startZxing();
    }

    start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
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
            {/* Diagnostika: kadrlar soni o'sib borsa — skaner haqiqatan
                o'qiyapti (muammo kodni ko'rsatishda). O'smasa — sikl
                ishlamayapti. Sabab shu qatordan darhol ko'rinadi. */}
            <div className="scan-diag">v5 · {diag}</div>
            {seen && <div className="scan-code">{seen}</div>}
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
