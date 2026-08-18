// AVTOMATIK YOZILADI — qo'lda tahrirlamang.
// Manba: brand/buysale-mark.svg, yig'uvchi: brand/build.mjs
//
// Belgi inline turadi: rangi va o'lchami ekranga qarab moslashadi,
// qo'shimcha so'rov ketmaydi va chop etishda ham chiqadi.

/** Brend belgisi. mono — bitta rangda (currentColor). */
export function Logo({ size = 32, mono }: { size?: number; mono?: boolean }) {
  const green = mono ? 'currentColor' : '#12B24A';
  const blue = mono ? 'currentColor' : '#1546E8';
  return (
    <svg
      width={size}
      height={(size * 690) / 1180}
      viewBox="40 275 1180 690"
      role="img"
      aria-label="BuySale"
    >
      {/* Yashil: savat dastasi va qiya tushgan devori, u "B" ga aylanadi.
      Ko'k: "S" — yuqori chizig'i o'ngga cho'zilgan, ikkala uchi qiya
      kesilgan (yuqori o'ng va pastki chap). */}
      <g fill="none" strokeWidth="88" strokeLinejoin="round">
      <g stroke={green} strokeLinecap="round">
      <path d="M96 333 H228 C272 333 292 366 300 416 L378 762"/>
      <path d="M305 437 H600 C682 437 682 600 600 600 H341"/>
      <path d="M341 600 H620 C702 600 702 762 620 762 H378"/>
      </g>
      <g stroke={blue} strokeLinecap="butt">
      <path d="M1150 440 H800 C750 440 750 600 800 600 H1042 C1094 600 1094 757 1042 757 H748"/>
      </g>
      </g>
      <path d="M1150 396 H1198 L1150 484 Z" fill={blue}/>
      <path d="M748 713 V801 L700 801 Z" fill={blue}/>
      <circle cx="452" cy="886" r="68" fill={green}/>
      <circle cx="940" cy="886" r="68" fill={blue}/>
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
