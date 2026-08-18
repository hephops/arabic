// AVTOMATIK YOZILADI — qo'lda tahrirlamang.
// Manba: brand/buysale-mark.svg, yig'uvchi: brand/build.mjs
//
// Belgi inline turadi: rangi va o'lchami ekranga qarab moslashadi,
// qo'shimcha so'rov ketmaydi va chop etishda ham chiqadi.

/** Brend belgisi. mono — bitta rangda (currentColor). */
export function Logo({ size = 32, mono }: { size?: number; mono?: boolean }) {
  const green = mono ? 'currentColor' : '#21A038';
  const blue = mono ? 'currentColor' : '#1B5CE8';
  return (
    <svg
      width={size}
      height={(size * 210) / 306}
      viewBox="0 0 306 210"
      role="img"
      aria-label="BuySale"
    >
      {/* VAQTINCHALIK: asl fayl kelguncha turadi (brand/README.md ga qarang).
      Yashil: savat dastasi, u to'g'ridan-to'g'ri "B" ga aylanadi.
      Ko'k: "S" — uning yuqori chizig'i o'ngga cho'zilib savatning
      yuqori chekkasi bo'lib qoladi, alohida chiziq yo'q. */}
      <g fill="none" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
      <g stroke={green}>
      <path d="M14 34 H52 C74 34 86 48 86 70 V158"/>
      <path d="M86 70 H120 C142 70 142 106 120 106 H86"/>
      <path d="M86 106 H128 C151 106 151 158 128 158 H86"/>
      </g>
      <g stroke={blue}>
      <path d="M256 40 H196 C176 40 176 74 196 74 H216 C238 74 238 110 216 110 H176"/>
      </g>
      </g>
      <circle cx="114" cy="184" r="14" fill={green}/>
      <circle cx="212" cy="184" r="14" fill={blue}/>
    </svg>
  );
}

/** Nom: "Buy" to'q, "Sale" ko'k */
export function Wordmark({ light }: { light?: boolean }) {
  return (
    <span className="wordmark">
      <b style={light ? { color: '#fff' } : undefined}>Buy</b>
      <i>Sale</i>
    </span>
  );
}
