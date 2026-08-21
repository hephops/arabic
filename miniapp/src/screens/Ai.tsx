import { useEffect, useRef, useState } from 'react';
import { api, fmt, BASE, AiMessage, AiStatus, AiDraftItem } from '../api';
import AiDraft from './AiDraft';
import { AppIcon, Glyph } from '../icons';
import { SubHeader } from '../ui';
import { useT } from '../i18n';
import { toast, loadFailed } from '../toast';
import { haptic, setBackButton } from '../telegram';

// AI yordamchi bilan suhbat.
//
// Do'konchi telefonda, ish ustida yozadi — shuning uchun ekran oddiy
// chat: yuqorida savol-javob, pastda yozish maydoni. Boshida esa
// tayyor savollar turadi: birinchi marta kirganda "nima so'rashim
// mumkin?" degan savol tug'ilmasin.

/** Suhbatdagi tasdiqlash kartasi: qaysi xabardan keyin turishi — `at` */
type DraftCard = { at: number; id: number; items: AiDraftItem[] };

// Bazadan tiklangan karta suhbatning OXIRIDA turadi: u qaysi xabardan
// keyin chiqqani endi ma'lum emas, do'konchi esa uni darrov ko'rishi
// kerak — tovar hali omborga tushmagan.
const TAIL = Number.MAX_SAFE_INTEGER;

const SUGGESTIONS = [
  { key: 'aiQ1', q: "Bugungi savdo va foyda qancha?" },
  { key: 'aiQ2', q: "Qaysi tovarlarning srogi yaqin?" },
  { key: 'aiQ3', q: "Kim qarzdor va kim kechiktiryapti?" },
  { key: 'aiQ4', q: "Nima tugayapti, nima buyurtma qilay?" },
  { key: 'aiQ5', q: "Qaysi tovar ombordagi pulni bog'lab yotibdi?" },
  { key: 'aiQ6', q: "Srogi yaqin tovarlarni telegramga yubor" },
];


/**
 * Suratni yuborishdan oldin kichraytirish.
 *
 * Telefon kamerasi 12 megapikselli surat beradi. Uni shundoq
 * yuborish uch joyda zarar: tarmoqda sekin, modelda qimmat
 * (rasm token bilan hisoblanadi), serverda esa chegaradan oshadi.
 *
 * IPHONE MUAMMOSI: iOS Safari'da canvas maydoni cheklangan. 12 MP
 * surat (4032x3024) o'sha chegaradan oshadi va toDataURL bo'sh
 * yoki qora rasm qaytaradi — do'konchi esa "yubordim" deb o'ylab
 * turaveradi. Shuning uchun:
 *   - avval createImageBitmap sinaladi (u kattaroq rasmni ham
 *     eplaydi va HEIC ni ham ochadi);
 *   - piksel soni ~2 megapikseldan oshmaydi;
 *   - natija TEKSHIRILADI: haqiqiy JPEG chiqmasa xato beriladi,
 *     jimgina buzuq rasm yuborilmaydi.
 */
async function shrink(file: File): Promise<string> {
  const MAX_SIDE = 1280;
  const MAX_PIXELS = 2_200_000; // iOS canvas chegarasidan xavfsiz pastda

  let src: ImageBitmap | HTMLImageElement | null = null;
  let url = '';
  try {
    if (typeof createImageBitmap === 'function') {
      src = await createImageBitmap(file);
    }
  } catch {
    /* eplamasa quyida <img> orqali sinaymiz */
  }
  if (!src) {
    url = URL.createObjectURL(file);
    src = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('decode'));
      im.src = url;
    });
  }

  try {
    const iw = (src as any).width as number;
    const ih = (src as any).height as number;
    if (!iw || !ih) throw new Error('empty');

    let scale = Math.min(1, MAX_SIDE / Math.max(iw, ih));
    if (iw * ih * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (iw * ih));

    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('ctx');
    // Oq fon: shaffof PNG jpeg ga aylanganda qora bo'lib qolmasin
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src as any, 0, 0, w, h);

    const out = c.toDataURL('image/jpeg', 0.78);
    // TEKSHIRUV: iOS chegaradan oshsa "data:," qaytaradi
    if (!out.startsWith('data:image/jpeg;base64,') || out.length < 2000) {
      throw new Error('canvas');
    }
    return out;
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (typeof (src as any)?.close === 'function') (src as any).close();
  }
}

export default function Ai({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  const [msgs, setMsgs] = useState<AiMessage[]>([]);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // React holati darhol yangilanmaydi: Enter tez-tez bosilsa bir necha
  // so'rov birdaniga ketib qolardi (ekranda uchta bir xil savol).
  // Ref esa o'sha zahoti o'zgaradi.
  const sending = useRef(false);
  // Hozir qaysi vosita ishlayapti — kutish jonli ko'rinsin
  const [statusTool, setStatusTool] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  // Suhbatdagi tasdiqlash kartalari: qaysi xabardan keyin turishi
  const [drafts, setDrafts] = useState<DraftCard[]>([]);

  /**
   * Kartani ro'yxatga qo'shish.
   *
   * Bitta taklif ikki yo'ldan kelishi mumkin: oqimdagi `draft` hodisasi
   * va bazadagi 'pending' ro'yxati. Ilova ochilgan zahoti ikkalasi
   * ustma-ust tushib, ekranda bir xil karta ikki marta turib qolardi —
   * shuning uchun id bo'yicha ikkinchisi tashlanadi.
   */
  function addDrafts(list: DraftCard[]) {
    setDrafts((d) => [...d, ...list.filter((n) => !d.some((x) => x.id === n.id))]);
  }

  /**
   * Karta tasdiqlandi.
   *
   * Karta ekrandan OLIB TASHLANMAYDI — o'z o'rnida "omborga tushdi"
   * ko'rinishiga o'tadi. Do'konchi qaysi karta bajarilganini o'sha
   * joyning o'zida ko'rishi kerak; ro'yxatdan yo'q qilib yuborilsa,
   * suhbat pastga siljib ketgan paytda hech qanday iz qolmasdi.
   * Bekor qilingani ham xuddi shunday joyida qoladi.
   *
   * Qayta kirilganda qaytmasligini baza hal qiladi: taklif endi
   * 'pending' emas, ya'ni /ai/intake/pending uni bermaydi.
   */
  function draftDone(_id: number, txt: string) {
    setMsgs((m) => [...m, { role: 'assistant', text: txt, created_at: '' }]);
  }

  useEffect(() => {
    api.aiHistory().then(setMsgs).catch(loadFailed);
    api.aiStatus().then(setStatus).catch(loadFailed);
    // Tarix bilan birga tasdiqlanmagan takliflar ham qaytariladi:
    // do'konchi kartadan chiqib ketgan bo'lsa ham tovar omborga hali
    // tushmagan. Xatosi ko'rsatilmaydi — suhbatning o'zi baribir ishlaydi.
    api
      .aiIntakePending()
      .then((list) => addDrafts(list.map((p) => ({ at: TAIL, id: p.id, items: p.items }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length, busy, drafts.length]);

  async function send(q: string, img?: string | null) {
    const question = q.trim();
    const pic = img ?? photo;
    if ((!question && !pic) || sending.current) return;
    sending.current = true;
    haptic.select();
    setText('');
    // Savol darhol ekranga chiqadi — javob kutilayotgani bilinib tursin
    setPhoto(null);
    // Surat pufakchaning ichida darhol ko'rinadi: pic — telefonda
    // kichraytirilgan "data:image/jpeg;base64,..." satri, uni serverdan
    // kutish shart emas. Sahifa qayta yuklanganda o'sha xabar tarixdan
    // "/uploads/..." yo'li bilan keladi — <img src> ikkalasini ham tushunadi.
    setMsgs((m) => [...m, { role: 'user', text: question, image_url: pic ?? null, created_at: '' }]);
    setBusy(true);
    setStatusTool('');
    // Javob bo'lak-bo'lak keladi.
    //
    // Javob pufakchasi DARHOL qo'shiladi (bo'sh holda), keyin har
    // bo'lakda oxirgi xabar almashtiriladi. Ilgari "birinchi bo'lakda
    // qo'sh, keyingilarida almashtir" degan bayroq ishlatilgandi va
    // savolning o'zi yo'qolib qolardi: React yangilanishni keyinroq
    // bajaradi, o'sha paytda bayroq allaqachon o'zgargan bo'lib,
    // birinchi bo'lak foydalanuvchi xabarini bosib yozardi.
    setMsgs((m) => [...m, { role: 'assistant', text: '', created_at: '' }]);
    let acc = '';
    const push = (delta: string) => {
      acc += delta;
      const text = acc;
      setMsgs((m) => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', text, created_at: '' };
        return next;
      });
    };
    try {
      await api.aiStream(
        // Matn yozilmagan bo'lsa BO'SH ketadi: modelga standart
        // ko'rsatmani server o'zi qo'yadi. Ilgari bu yerda tayyor gap
        // yuborilardi va u tarixda do'konchining o'z yozuvi bo'lib
        // qolardi — qayta ochganda u yozmagan jumla turardi.
        question,
        (e) => {
          if (e.type === 'text') push(e.delta);
          else if (e.type === 'status') setStatusTool(e.tool);
          else if (e.type === 'error') push((acc ? '\n\n' : '') + e.message);
          else if (e.type === 'draft') {
            // Karta javob matnidan keyin turadi
            addDrafts([{ at: msgs.length + 1, id: e.draft_id, items: e.items }]);
          }
        },
        pic ?? undefined
      );
      if (!acc) push(t('aiNoAnswer'));
      api.aiStatus().then(setStatus).catch(() => {});
    } catch (e: any) {
      push((acc ? '\n\n' : '') + (e.details?.message ?? e.message));
    } finally {
      sending.current = false;
      setStatusTool('');
      setBusy(false);
    }
  }

  /**
   * Javobni Telegramga o'tkazish.
   *
   * Modelga umuman tegilmaydi: matn allaqachon bizda, uni faqat
   * uzatish kerak. Ilgari yordamchiga "shuni yubor" deb qaytarilardi
   * va bu o'n soniyalab cho'zilib, ba'zan uzilib ham qolardi.
   */
  const [tgSent, setTgSent] = useState(-1);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [warnHidden, setWarnHidden] = useState(false);
  // Yuborilishi kutilayotgan surat (data URL) va uning ko'rinishi
  const [photo, setPhoto] = useState<string | null>(null);
  // To'liq ekranda ochilgan surat: nakladnoydagi mayda yozuvni
  // pufakchadagi kichik rasmdan o'qib bo'lmaydi
  const [zoom, setZoom] = useState<string | null>(null);

  // Surat to'liq ekranda turganda:
  //  - orqadagi suhbat surilmasin (barmoq qoplama ustida harakatlansa
  //    ham ro'yxat siljib ketardi);
  //  - Telegramning "Orqaga" tugmasi avval SURATNI yopsin. Ilgari u
  //    butun AI ekranidan chiqarib yuborardi va do'konchi suhbatini
  //    yo'qotardi.
  useEffect(() => {
    if (!zoom) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setBackButton(() => setZoom(null));
    return () => {
      document.body.style.overflow = prev;
      setBackButton(onBack);
    };
  }, [zoom, onBack]);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Chegara qachon ogohlantirsin.
   *
   * Ilgari "2 ta qolganda" deb qat'iy son qo'yilgandi. Chegara 10 ta
   * bo'lsa bu to'g'ri, 50 ta bo'lsa esa juda kech: 48 tasi
   * ishlatilib bo'lgandan keyin ogohlantirishning foydasi yo'q.
   * Endi ulushga qarab: chegaraning beshdan biri qolganda, lekin
   * kamida ikkita qolganda.
   */
  const quotaLevel = (() => {
    if (!status || status.daily_limit <= 0 || status.left_today === null) return 'ok';
    if (status.left_today === 0) return 'out';
    const warnAt = Math.max(2, Math.ceil(status.daily_limit * 0.2));
    return status.left_today <= warnAt ? 'low' : 'ok';
  })();
  async function sendToTelegram(text: string, i: number) {
    haptic.select();
    try {
      await api.aiToTelegram(text, t('aiTgTitle'));
      setTgSent(i);
      toast.success(t('aiTgDone'));
    } catch (e: any) {
      toast.error(t('error'), e.details?.message ?? e.message);
    }
  }

  async function clear() {
    if (!confirm(t('aiClearAsk'))) return;
    await api.aiClear();
    setMsgs([]);
    toast.info(t('aiCleared'));
  }

  // Ekranga chiqadigan xabarlar. Matnsiz, faqat suratli xabar ham
  // ko'rinishi kerak. Tasdiqlash kartalari SHU ro'yxatdagi indeksga
  // qarab joylashadi (d.at), shuning uchun ro'yxat bitta joyda
  // hisoblanadi — pastdagi ikki filtr ayrilib qolmasin.
  const shown = msgs.filter((m) => m.text || m.image_url);

  if (status && !status.enabled) {
    return (
      <>
        <SubHeader title={t('aiTitle')} onBack={onBack} />
        <div className="screen empty">
          <AppIcon glyph="sparkle" color="pink" size={54} />
          <p className="hint center">{t('aiOff')}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <SubHeader
        title={t('aiTitle')}
        onBack={onBack}
        right={
          msgs.length > 0 ? (
            <button className="nav-btn" onClick={clear} aria-label={t('aiClear')}>
              <Glyph name="trash" size={18} color="var(--danger)" />
            </button>
          ) : undefined
        }
      />
      <div className="screen ai-screen">
        {msgs.length === 0 && (
          <div className="ai-intro">
            <AppIcon glyph="sparkle" color="pink" size={52} />
            <div className="ai-intro-title">{t('aiHello')}</div>
            <p className="hint center">{t('aiHint')}</p>
            {status && status.price > 0 && (
              <p className="hint center">{t('aiPriceHint').replace('{n}', fmt(status.price))}</p>
            )}
          </div>
        )}

        {shown.map((m, i) => {
          // "data:" — endigina yuborilgan surat, qolgani serverdagi fayl
          const img = m.image_url
            ? m.image_url.startsWith('data:')
              ? m.image_url
              : BASE + m.image_url
            : null;
          return (
            <div key={i} className={`ai-msg-wrap ${m.role}`}>
              <div className={`ai-msg ${m.role}${img ? ' with-img' : ''}`}>
                {img && (
                  <img
                    className="ai-msg-img"
                    src={img}
                    alt=""
                    loading="lazy"
                    // Surat yuklanmaguncha balandligi nolga teng. Avtomatik
                    // pastga surish esa xabar qo'shilishi bilan ishlaydi —
                    // ya'ni surat o'sishidan OLDIN. Shuning uchun oxirgi
                    // xabardagi surat yuklangach yana bir marta suriladi,
                    // aks holda javob ekran ostida qolib ketardi.
                    onLoad={() => {
                      if (i === shown.length - 1) endRef.current?.scrollIntoView({ block: 'end' });
                    }}
                    onClick={() => setZoom(img)}
                  />
                )}
                {/* Matn bo'sh bo'lsa (faqat surat yuborilgan) hech narsa
                    chizilmaydi — pufakchada ortiqcha joy qolmasin */}
                {m.text && <span className="ai-msg-txt">{m.text}</span>}
              </div>
              {/* Javobni bir bosishda Telegramga o'tkazish. Yordamchi
                  buni gap bilan ham qila oladi, lekin do'konchi bunday
                  imkoniyat borligini bilishi kerak — tugma ko'rinib
                  tursin. */}
              {m.role === 'assistant' && m.text.length > 40 && (
                <button className="ai-send-tg" onClick={() => sendToTelegram(m.text, i)}>
                  <Glyph name={tgSent === i ? 'check' : 'send'} size={13} color="var(--accent)" />{' '}
                  {tgSent === i ? t('aiTgDone') : t('aiToTelegram')}
                </button>
              )}
              {drafts
                .filter((d) => d.at === i)
                .map((d) => (
                  <AiDraft key={d.id} draftId={d.id} items={d.items} onDone={(txt) => draftDone(d.id, txt)} />
                ))}
            </div>
          );
        })}

        {/* Oxirgi javobdan keyin kelgan va bazadan tiklangan (at = TAIL) kartalar */}
        {drafts
          .filter((d) => d.at >= shown.length)
          .map((d) => (
            <AiDraft key={d.id} draftId={d.id} items={d.items} onDone={(txt) => draftDone(d.id, txt)} />
          ))}

        {busy && (
          <div className="ai-msg assistant thinking">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            {statusTool && <span className="ai-status">{t('tool_' + statusTool)}</span>}
          </div>
        )}
        <div ref={endRef} />

        {/* Tayyor savollar — birinchi marta kirganda nima so'rashni bilsin */}
        {!busy && (
          <div className="chip-row wrap ai-sugg">
            {SUGGESTIONS.map((s) => (
              <button key={s.key} className="chip" onClick={() => send(s.q)}>
                {t(s.key)}
              </button>
            ))}
          </div>
        )}

      </div>

      {/* Kattalashtirilgan surat — qayerga bosilsa ham yopiladi */}
      {zoom && (
        <div className="ai-zoom" onClick={() => setZoom(null)} role="button" aria-label={t('close')}>
          <img src={zoom} alt="" />
        </div>
      )}

      {/* Chegara oynasi — ko'rsatkich bosilganda ochiladi */}
      {quotaOpen && status && (
        <>
          <div className="ai-quota-back" onClick={() => setQuotaOpen(false)} />
          <div className="ai-quota-pop">
            <div className="ai-quota-row">
              <span>{t('aiQuota')}</span>
              <b>
                {status.asked_today} / {status.daily_limit}
              </b>
            </div>
            <div className="ai-quota-bar">
              <div
                className={`fill ${quotaLevel}`}
                style={{ width: `${Math.min(100, (status.asked_today / Math.max(1, status.daily_limit)) * 100)}%` }}
              />
            </div>
            <div className="ai-quota-sub">
              {status.left_today === 0
                ? t('aiQuotaOut')
                : t('aiLeft').replace('{n}', String(status.left_today ?? 0))}
              {' · '}
              {t('aiQuotaReset')}
            </div>

            <div className="ai-quota-row sep">
              <span>{t('aiQuotaPrice')}</span>
              <b>{status.price > 0 ? fmt(status.price) : t('aiFree')}</b>
            </div>
            <div className="ai-quota-row">
              <span>{t('aiQuotaModel')}</span>
              <b>{status.model.replace('claude-', '').replace(/-\d.*$/, '')}</b>
            </div>
          </div>
        </>
      )}

      {/* Yozish paneli: ogohlantirish lentasi va kiritish qatori
          BITTA idishda turadi. Ilgari lenta alohida joylashtirilib,
          "pastdan shuncha piksel" deb qat'iy raqam yozilgandi va u
          panel bilan ustma-ust tushib qolardi. Endi ular yopishgan. */}
      <div className="ai-dock">
      {/* Ogohlantirish lentasi — AYNAN yozish maydonining ustida.
            Chegara yaqinlashganda do'konchi buni savol yozayotganda
            ko'rishi kerak. Ekranning tepasida tursa suhbat surilib
            ketganda ko'rinmay qoladi. Yopilsa shu seans davomida
            qaytmaydi. */}
          {status && quotaLevel !== 'ok' && !warnHidden && (
          <div className={`ai-warn ${quotaLevel}`}>
            <Glyph name="warning" size={15} color={quotaLevel === 'out' ? 'var(--red)' : 'var(--yellow)'} />
            <span>
              {quotaLevel === 'out'
                ? t('aiWarnOut')
                : t('aiWarnLow')
                    .replace('{p}', String(Math.round((status.asked_today / Math.max(1, status.daily_limit)) * 100)))
                    .replace('{n}', String(status.left_today ?? 0))}
            </span>
            <button className="ai-warn-x" onClick={() => setWarnHidden(true)} aria-label={t('cancel')}>
              <Glyph name="close" size={14} color="var(--muted)" />
            </button>
          </div>
        )}

        {/* Tanlangan surat — yuborishdan oldin ko'rinib tursin */}
        {photo && (
          <div className="ai-photo">
            <img src={photo} alt="" />
            <div className="ai-photo-txt">{t('aiPhotoHint')}</div>
            <button className="ai-warn-x" onClick={() => setPhoto(null)} aria-label={t('cancel')}>
              <Glyph name="close" size={15} color="var(--muted)" />
            </button>
          </div>
        )}

        <div className="ai-bar-row">
          {/* Daftar yoki nakladnoyni suratga olish. Telefonda kamera
              ochiladi, kompyuterda fayl tanlash oynasi. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                setPhoto(await shrink(f));
              } catch {
                // Buzuq rasmni jimgina yuborgandan ko'ra aytgan yaxshi
                toast.error(t('aiPhotoFail'), t('aiPhotoFailSub'));
              }
            }}
          />
          <button className="ai-photo-btn" onClick={() => fileRef.current?.click()} aria-label={t('aiPhoto')}>
            <Glyph name="camera" size={19} color="var(--accent)" />
          </button>
        {/* Qancha savol qolgani — yuborish tugmasining yonida.
            Bosilsa batafsil oyna ochiladi. */}
        {status && status.daily_limit > 0 && (
          <button
            className={`ai-quota-btn ${quotaLevel}`}
            onClick={() => setQuotaOpen((v) => !v)}
            aria-label={t('aiQuota')}
          >
            {status.left_today}
          </button>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(text)}
          placeholder={t('aiPlaceholder')}
          disabled={busy}
        />
        <button
            className="ai-send"
            onClick={() => send(text)}
            disabled={busy || (!text.trim() && !photo)}
            aria-label={t('send')}
          >
          <Glyph name="arrowUp" size={20} color="#fff" strokeWidth={2.4} />
        </button>
      </div>
      </div>
    </>
  );
}
