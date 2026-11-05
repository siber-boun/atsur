/** ATSUR (ATtack SURface) markası: dörtnala koşan at silüeti — "at sürenindir". */
const HORSE_PATH = 'M18 17 C24 15 32 16 37 15 C40 12 44 8 47 5 L48 2 L50 5 C53 6 57 9 60 12 C61 13 60 15 58 15 C55 14 52 14 50 14 C48 17 46 20 45 22 C48 23 52 24 55 24 L58 26 L56 27 C52 27 48 27 44 26.5 C45 30 47 33 49 36 L47 37 C44 34 41 30 40 28 C35 30 28 30 24 29 C22 33 19 37 15 40 L13 39 C15 35 18 31 19 28 C16 30 12 31 8 31 L7 29 C11 28 15 26 17 24 C13 22 9 24 5 22 C8 19 13 18 18 17 Z';

export function HorseMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.78)} viewBox="3 0 58 45" aria-hidden="true" focusable="false">
      <path d={HORSE_PATH} fill="currentColor" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function BrandLockup({ tagline = true }: { tagline?: boolean }) {
  return (
    <div className="ac-brand" aria-label="ATSUR">
      <span className="ac-brand-mark"><HorseMark /></span>
      <span className="ac-brand-copy">
        <span className="ac-brand-name">AT<b>SUR</b></span>
        {tagline && <span className="ac-brand-tag">attack surface</span>}
      </span>
    </div>
  );
}
