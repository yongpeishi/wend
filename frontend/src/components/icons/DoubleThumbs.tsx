/*
 * The two glyphs lucide does not have: a doubled thumb, for the ends of the
 * -2..2 vote scale. One thumb is "keen"; two overlapping thumbs are "really
 * keen", and the doubling is the whole signal — same stroke, same weight, same
 * 1.5px hairline as every lucide icon beside it, so the five stops read as one
 * set rather than four lucide icons and two strangers.
 *
 * The paths are lucide's own thumbs-up geometry, copied verbatim from the
 * design's `icons/double-thumbs-up.svg`, drawn twice: the back thumb pushed up
 * and right at 0.78 scale, the front one dropped 5 units at full size. That is
 * why the viewBox is 34x30 rather than lucide's square 24 — the pair is wider
 * and shorter than one thumb, and squeezing it into 24x24 would shrink the
 * strokes out of step with their neighbours. `size` therefore sets the box, not
 * the width: the caller asks for 22 and gets a 22px-tall pair.
 *
 * Down is the same drawing rotated half a turn about the centre of the box
 * (17, 15) rather than a second set of paths, so the two icons cannot drift
 * apart under editing.
 *
 * Both are `aria-hidden`: every caller labels its own button, and an icon that
 * announced itself would double up that name.
 */

interface DoubleThumbsProps {
  /** Height and width of the box, in px. 22 is the vote bar's stop glyph. */
  size?: number;
  className?: string;
}

/** One thumb, twice: the back one small and high, the front one full size. */
function ThumbPair() {
  return (
    <>
      <g transform="translate(12,-3) scale(0.78)">
        <path d="M7 10v12" />
        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
      </g>
      <g transform="translate(0,5) scale(1)">
        <path d="M7 10v12" />
        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
      </g>
    </>
  );
}

/** Shared frame: lucide's stroke settings, so these sit level with lucide icons. */
function DoubleThumbsFrame({ size = 22, className, children }: DoubleThumbsProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 30"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Two thumbs up — the +2 stop, "really keen". */
export function DoubleThumbsUp({ size, className }: DoubleThumbsProps) {
  return (
    <DoubleThumbsFrame size={size} className={className}>
      <ThumbPair />
    </DoubleThumbsFrame>
  );
}

/** Two thumbs down — the -2 stop, "really not keen". */
export function DoubleThumbsDown({ size, className }: DoubleThumbsProps) {
  return (
    <DoubleThumbsFrame size={size} className={className}>
      <g transform="rotate(180 17 15)">
        <ThumbPair />
      </g>
    </DoubleThumbsFrame>
  );
}
