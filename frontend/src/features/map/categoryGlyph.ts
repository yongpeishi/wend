// The category glyphs, as raw SVG markup.
//
// These are Lucide icons, transcribed by hand from `lucide-react` 1.30.0 —
// already a dependency, and drawn as components everywhere else in the app.
// The set is the one settled in the feedback-15 design: Camera, Utensils,
// Footprints, Bed, TrainFront, Asterisk. categoryGlyph.test.tsx renders each
// of those components and checks the path data here against them, so a
// re-transcription or a wrong pick fails a test rather than a glance.
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
  // Camera — "somewhere worth looking at". The lens is the only filled centre
  // in the set: a focal point that holds at 16px where an outline thins out.
  place:
    '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"></path><circle cx="12" cy="13" r="3"></circle>',
  // Utensils — quieter than the crossed pair, and it reads as cutlery rather
  // than as an X, which matters on a map where a crossed diagonal already
  // suggests "closed". The thinnest glyph in the set: two near-parallel
  // uprights about 2px apart at 16px. The design's size test judged it holds.
  food:
    '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path>',
  // Footprints — the trail metaphor the whole product is built on, finally on
  // the map. The softest shape in the set; at 16px the two prints are at their
  // limit, which is why the stroke is 2 here and not the app's 1.5.
  activity:
    '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"></path><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"></path><path d="M16 17h4"></path><path d="M4 13h4"></path>',
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
