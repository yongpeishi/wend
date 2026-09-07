// The category glyphs, as raw SVG markup.
//
// These are Lucide icons, transcribed by hand from `lucide-react` 1.30.0 —
// already a dependency, and drawn as components everywhere else in the app.
// They cannot be used as components here: a Leaflet `divIcon`'s HTML is a
// *string*, so nothing in markerIcon.ts can host a React element. So the path
// data lives here instead, verbatim from the library at that version. If the
// dependency is ever bumped and an icon is redrawn, this file is the copy that
// has to be re-transcribed — it will not follow along on its own.
//
// Nothing here names a colour. Like markerIcon.ts, this module only ever emits
// a `var(…)` token or `currentColor` handed to it by the caller: a hex in a
// string-built icon would be the one place in the app where a colour escapes
// the token file, and the hardest place to notice it had.

import type { EntryCategory } from '../../api/types';

/** Inner SVG markup — no <svg> wrapper — on Lucide's 24-unit grid. */
export const CATEGORY_GLYPH: Record<EntryCategory, string> = {
  // Landmark — "a place worth stopping at", said without redrawing the pin it
  // sits inside.
  place:
    '<path d="M10 18v-7"></path><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"></path><path d="M14 18v-7"></path><path d="M18 18v-7"></path><path d="M3 22h18"></path><path d="M6 18v-7"></path>',
  // UtensilsCrossed — the crossed diagonal is what keeps its shape at 16px;
  // upright cutlery merges into one stroke that small.
  food:
    '<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"></path><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"></path><path d="m2.1 21.8 6.4-6.3"></path><path d="m19 5-7 7"></path>',
  // Ticket — a long horizontal silhouette, unlike anything else in the set, so
  // it is told apart by outline before any detail resolves.
  activity:
    '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path><path d="M13 5v2"></path><path d="M13 17v2"></path><path d="M13 11v2"></path>',
  // Bed — already the product's lodging glyph: LodgingPill, DayRow and DayCard
  // all draw it, so the map is repeating a word the reader has, not coining one.
  lodging:
    '<path d="M2 4v16"></path><path d="M2 8h18a2 2 0 0 1 2 2v10"></path><path d="M2 17h20"></path><path d="M6 8v9"></path>',
  // TrainFront — rail and trail is the vocabulary the brand already speaks.
  transport:
    '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"></path><path d="m9 15-1-1"></path><path d="m15 15 1-1"></path><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"></path><path d="m8 19-2 3"></path><path d="m16 19 2 3"></path>',
  // Asterisk — three strokes and no metaphor to misread. "Other" should not
  // look like it means something in particular.
  other: '<path d="M12 6v12"></path><path d="M17.196 9 6.804 15"></path><path d="m6.804 9 10.392 6"></path>',
};

export interface GlyphOptions {
  /** Rendered edge length in px. */
  size: number;
  /** A CSS colour. Always a token `var(…)` or `currentColor` — never a hex. */
  color: string;
  /** Defaults to 2 — the map's weight, not the app's 1.5. */
  strokeWidth?: number;
}

/**
 * 2, not the 1.5 the rest of the app uses (47 of 59 `strokeWidth` props).
 * A 24-unit grid scaled down to 16px turns a 1.5 stroke into roughly one
 * physical pixel, and one pixel of leaf over photographic map tiles simply
 * disappears. The heavier weight is for the map alone; everywhere else the
 * 1.5 convention stands.
 */
const MAP_STROKE_WIDTH = 2;

/**
 * A complete <svg> element string ready to embed in a divIcon.
 *
 * Returns '' for a null/undefined category, so an uncategorised pin draws
 * exactly as it does today — the fallback is the current mark, never a
 * placeholder glyph standing in for a word the trip never said.
 */
export function categoryGlyphSvg(
  category: EntryCategory | null | undefined,
  options: GlyphOptions,
): string {
  if (!category) return '';
  const { size, color, strokeWidth = MAP_STROKE_WIDTH } = options;
  // aria-hidden on every glyph: the category is spoken by the marker's own
  // aria-label, so a screen reader that also announced the drawing would say
  // it twice.
  //
  // `wend-pin-glyph` is the seam with MapView.module.css — this function is the
  // only thing that draws one of these, so the class is emitted here rather
  // than pasted on afterwards by whichever builder embeds it.
  return (
    `<svg class="wend-pin-glyph" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"` +
    ` width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"` +
    ` stroke="${color}" stroke-width="${strokeWidth}"` +
    ` stroke-linecap="round" stroke-linejoin="round">${CATEGORY_GLYPH[category]}</svg>`
  );
}
