/*
 * The third glyph lucide does not have: a thumb turned sideways, for the 0 stop
 * of the -2..2 vote scale.
 *
 * The stop used to be `Minus` — a flat line. It was legible, but it was the only
 * mark on the scale that was not a hand: four thumbs and a dash, so the middle
 * answer read as the absence of an answer rather than as one of the five. A
 * sideways thumb is the gesture people already make for "it's fine either way",
 * and it puts the whole scale in one language — direction is the signal (up,
 * sideways, down) and doubling is the magnitude.
 *
 * The drawing is lucide's own thumbs-up geometry, verbatim, rotated a quarter
 * turn anticlockwise about the centre of the 24x24 box: the fist ends up at
 * the right and the thumb points left, and the strokes stay exactly the weight
 * and shape of the `ThumbsUp` beside it. Rotating rather than redrawing is the
 * same choice `DoubleThumbs` makes for its down variant, and for the same
 * reason — the glyphs cannot drift apart under editing.
 *
 * `aria-hidden`, like every icon in the vote bar: each stop is a button that
 * labels itself, and an icon that announced itself would double up that name.
 */

interface SidewaysThumbProps {
  /** Height and width of the box, in px. Matches the lucide `size` prop. */
  size?: number;
  className?: string;
}

/** A thumb held flat — the 0 stop, "neutral". */
export function SidewaysThumb({ size = 24, className }: SidewaysThumbProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <g transform="rotate(-90 12 12)">
        <path d="M7 10v12" />
        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
      </g>
    </svg>
  );
}
