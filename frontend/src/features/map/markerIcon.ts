import L from 'leaflet';
import type { EntryCategory } from '../../api/types';
import { CATEGORY_LABELS } from '../board/filters';
import { categoryGlyphSvg } from './categoryGlyph';
import type { PinState, PinTone } from './types';
import { pinStateLabel } from './pins';

// Custom SVG divIcons only — never Leaflet's default blue pin (and never its
// image-based default icon, which sidesteps the well-known bundler path
// problem entirely: nothing here ever touches L.Icon.Default).

const FILL: Record<PinState, string> = {
  scheduled: 'var(--stop-decided)',
  potential: 'var(--stop-waiting)',
  destination: 'var(--stop-destination)',
};

// The edge each pin draws around its fill. A solid pin gets the card-tone
// halo that lifts it off the tiles. The potential pin cannot: its pale fill
// is "pale = potential, solid = scheduled" (screens.md), but that pale on its
// own is 1.23:1 against paper — a reader with ordinary eyes reported the pins
// as invisible. So the potential pin is ringed in leaf instead: the ring puts
// its edge at 5.50:1 while the pale centre still tells it apart from a solid
// scheduled pin. That is a shape difference (ring vs disc), not just a tint,
// so colour is no longer carrying the meaning alone.
const STROKE: Record<PinState, string> = {
  scheduled: 'var(--surface-card)',
  potential: 'var(--stop-decided)',
  destination: 'var(--surface-card)',
};

// The glyph knocked out of (or laid onto) the stop circle. `potential` is
// deliberately the odd one out: the other two states fill solid, so paper reads
// straight out of them, but a pale fill cannot carry a paper glyph at all — it
// would be near-invisible on near-invisible. So the pale pin inverts and draws
// its category in the same deep leaf its ring already uses. That is the
// design's explicit call, not an oversight to "fix" back to paper.
const GLYPH: Record<PinState, string> = {
  scheduled: 'var(--surface-card)', // paper knocked out of leaf
  potential: 'var(--stop-decided)', // deep leaf on pale
  destination: 'var(--surface-card)', // paper knocked out of plum
};

// Two box constants, not one — and they must STAY two.
//
// `pinIcon`, `dotIcon`, `faintIcon` and `pendingIcon` all shared a single
// PIN_BOX until the category glyph arrived. `pinIcon`'s disc had to grow to
// 28px to hold a 16px glyph, and growing a shared constant would have silently
// resized the neutral dot, the faint dot and the pending ring along with it —
// each of which the stylesheet hard-codes at 32px (`.wend-pin-dot`), so the
// markup and the CSS would have quietly disagreed with no test to catch it.
//
// PIN_BOX is `pinIcon`'s alone. MARK_BOX is everyone else's, still 32, still
// byte-for-byte what it always was. Do not re-merge them.

/** `pinIcon` only — 40px so the grown 28px disc and its selection ring fit. */
const PIN_BOX = 40;
const PIN_CENTER = PIN_BOX / 2;

/**
 * `dotIcon`, `faintIcon` and `pendingIcon`, and matching `.wend-pin-dot`'s
 * hard-coded 32px in CSS. A 32px square hit area — "never below 32x32 for
 * pointer" (architecture.md §5) — around a Trail-scaled 8px-radius mark.
 */
const MARK_BOX = 32;
const MARK_CENTER = MARK_BOX / 2;

/** The glyph's drawn edge inside the stop circle. */
const PIN_GLYPH_SIZE = 16;

/** The disc's radius: a 28px stop circle, grown from 16px to hold the glyph. */
const DISC_RADIUS = 14;

/**
 * The selection ring, and the focus ring with it: 3px of apricot, 3px off the
 * disc's edge — "same apricot, same 3px at 3px" as focus everywhere else, and
 * exactly the `outline: 3px; outline-offset: 3px` the design draws around its
 * 28px disc. As a stroked SVG circle that is a radius of 14 + 3 + 1.5, whose
 * outer edge lands on the 40px box's edge with nothing to spare — which is
 * why the box is 40 and not the 32 every other mark keeps.
 */
const RING_RADIUS = DISC_RADIUS + 3 + 1.5;

/**
 * From the pin's centre to the near edge of its hover name: the disc's radius
 * plus the 6px gap the design fixes. Exported for the flip test in MapView —
 * the stylesheet positions the name with this same number.
 */
export const PIN_NAME_OFFSET = DISC_RADIUS + 6;

/**
 * Whether a stop-circle's hover name should open to the left of the disc
 * rather than the right. Leaflet clips at the map container, so a name that
 * would run past the right edge is cut off exactly where the reader is
 * panning to; within a name's width of that edge it opens the other way.
 * Pure, so the arithmetic is tested without a map: `pinX` and `mapWidth` in
 * container pixels, `nameWidth` the rendered pill's width.
 */
export function nameOpensLeft(pinX: number, mapWidth: number, nameWidth: number): boolean {
  return pinX + PIN_NAME_OFFSET + nameWidth > mapWidth;
}

/**
 * A single pin, styled like the brand's own trail stop circles.
 *
 * The name rides along as a second child of the button, hidden until hover
 * or keyboard focus (MapView.module.css does the showing). It is out of flow,
 * so it never moves the anchor — the same trick `labelIcon` and `chipIcon`
 * use — and it is aria-hidden, because the button's aria-label already says
 * the title: a screen reader would otherwise hear the name twice. Touch has
 * no hover, and loses nothing: a tap selects the pin and opens the popup,
 * which carries the name in text.
 */
export function pinIcon(
  state: PinState,
  selected: boolean,
  title: string,
  category?: EntryCategory | null,
): L.DivIcon {
  const ring = selected
    ? `<circle cx="${PIN_CENTER}" cy="${PIN_CENTER}" r="${RING_RADIUS}" fill="none" stroke="var(--stop-open)" stroke-width="3"/>`
    : '';
  const glyph = categoryGlyphSvg(category, { size: PIN_GLYPH_SIZE, color: GLYPH[state] });
  // A nested <svg> defaults to x=0,y=0 and categoryGlyphSvg emits no position
  // of its own (it has no idea what it is being embedded in), so the <g> is
  // what centres it. Drawn after the disc, so it sits on top of the fill.
  const offset = PIN_CENTER - PIN_GLYPH_SIZE / 2;
  const glyphMarkup = glyph ? `<g transform="translate(${offset}, ${offset})">${glyph}</g>` : '';
  // The glyph is a drawing, and a drawing cannot be the only place the category
  // is said (screens.md: never colour — or shape — alone). So the word rides in
  // the aria-label. With no category the label is exactly what it always was.
  const categoryWord = category ? ` — ${CATEGORY_LABELS[category]}` : '';
  const label = `${title}${categoryWord} — ${pinStateLabel(state)}`;
  const html = `
    <button type="button" class="wend-pin" aria-label="${escapeHtml(label)}">
      <svg width="${PIN_BOX}" height="${PIN_BOX}" viewBox="0 0 ${PIN_BOX} ${PIN_BOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        ${ring}
        <circle cx="${PIN_CENTER}" cy="${PIN_CENTER}" r="${DISC_RADIUS}" fill="${FILL[state]}" stroke="${STROKE[state]}" stroke-width="2"/>
        ${glyphMarkup}
      </svg>
      <span class="wend-pin-name" aria-hidden="true">${escapeHtml(title)}</span>
    </button>
  `;
  return L.divIcon({
    html,
    className: 'wend-pin-icon',
    iconSize: [PIN_BOX, PIN_BOX],
    iconAnchor: [PIN_CENTER, PIN_CENTER],
    popupAnchor: [0, -PIN_CENTER],
  });
}

/**
 * Tone -> modifier class. The class is all this file decides; the actual
 * colours live in MapView.module.css as custom properties, because a divIcon's
 * markup is a string and a string cannot read design tokens. Writing hex here
 * would be the one place in the app where a colour escapes the token file, and
 * it would escape into the hardest place to notice it.
 */
const TONE_CLASS: Record<PinTone, string> = {
  bundled: 'wend-pin-label--bundled',
  inView: 'wend-pin-label--in-view',
  offView: 'wend-pin-label--off-view',
};

/**
 * Matches the pill's rendered height in MapView.module.css — only used to lift
 * the popup clear of it. 29 = a 16px glyph (the tallest thing in the row now
 * that the pill is a centred flex line; the 15px text no longer sets the
 * height) + 5px padding twice + two 1.5px edges. It was 28 when the 15px text
 * was the tallest thing there.
 */
const LABEL_HEIGHT = 29;

/** The glyph's drawn edge in the name pill — one step up from the chip's, to match the pill's larger text. */
const LABEL_GLYPH_SIZE = 16;

/**
 * `currentColor`, in both the pill and the chip, and deliberately not a token.
 *
 * The chip is fixed paper-on-leaf, but the pill has four colour states — the
 * base and three tone modifiers — and each one sets `--pin-label-text` in
 * MapView.module.css. Naming a token here would mean either picking one of
 * those four and being wrong on the other three, or restating the whole tone
 * table in this file. `currentColor` inherits whichever one the stylesheet
 * settled on, so the glyph follows every tone for free and the colour decision
 * stays where every other colour decision lives.
 */
const TEXT_GLYPH_COLOR = 'currentColor';

/**
 * The accessible name for a chip or pill: the title plus the category word,
 * but ONLY when there is a category. With no category we emit no aria-label at
 * all, rather than an aria-label that merely repeats the title — the visible
 * text is already the accessible name, and re-stating it would be a change to
 * how these pins read today for no gain.
 */
function nameLabel(title: string, category: EntryCategory | null | undefined): string {
  if (!category) return '';
  return ` aria-label="${escapeHtml(`${title} — ${CATEGORY_LABELS[category]}`)}"`;
}

/**
 * The name-pill pin. Where `pinIcon` says "something is here", this says
 * "*this* is here" — at board zoom the reader is scanning a shortlist of
 * places they already named, so the name is the useful mark and a teardrop
 * is just a thing to hover.
 *
 * Deliberately sized by its own text, not by `iconSize`: the pill is as wide
 * as the title. So the icon is anchored at 0x0 and the pill centres itself on
 * that point in CSS (`translate(-50%, -50%)`), rather than Leaflet centring a
 * box whose width we would have to measure in advance — which we cannot do
 * before it is in the document.
 */
export function labelIcon(
  title: string,
  tone: PinTone | undefined,
  selected: boolean,
  category?: EntryCategory | null,
): L.DivIcon {
  const classes = ['wend-pin-label'];
  // No tone means no opinion, and the base class already resting-tones itself —
  // so an untoned pin is not silently reported as "off view".
  if (tone) classes.push(TONE_CLASS[tone]);
  if (selected) classes.push('is-selected');
  const glyph = categoryGlyphSvg(category, { size: LABEL_GLYPH_SIZE, color: TEXT_GLYPH_COLOR });
  // The title is wrapped in a <span> whether or not there is a glyph: the pill
  // is a flex row in CSS, and a bare text node would be an anonymous flex item
  // the stylesheet cannot reach. One markup shape, categorised or not.
  const html = `
    <button type="button" class="${classes.join(' ')}"${nameLabel(title, category)}>${glyph}<span>${escapeHtml(title)}</span></button>
  `;
  return L.divIcon({
    html,
    className: 'wend-pin-label-icon',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -LABEL_HEIGHT / 2],
  });
}

/**
 * Matches the chip's rendered height in MapView.module.css — 14px glyph (which
 * now out-measures the 13px text and so sets the flex line's height) + 4px×2
 * padding + 1.5px×2 border. It was 24 when the 13px text was the tallest thing
 * in the row.
 */
const CHIP_HEIGHT = 25;

/** The glyph's drawn edge in the chip — smaller than the pill's, matching the chip's smaller text. */
const CHIP_GLYPH_SIZE = 14;

/**
 * The labelled chip pin — the board's "this one is in the list you're reading"
 * mark. Same 0x0-anchor-and-CSS-centring trick as `labelIcon`, and for the
 * same reason: the chip is as wide as its title, which nothing can measure
 * before it is in the document. Colour is fixed (leaf on paper) rather than
 * toned, because the chip/dot split *is* the message — a second colour axis on
 * top of it would be two encodings fighting over one pill.
 */
export function chipIcon(
  title: string,
  selected: boolean,
  nested?: boolean,
  category?: EntryCategory | null,
): L.DivIcon {
  const classes = ['wend-pin-chip'];
  if (selected) classes.push('is-selected');
  if (nested) classes.push('wend-pin-chip--nested');
  // A nested place — one that lives inside another kept thing — keeps the
  // chip's colour and shape and dashes only its edge: the same "contained,
  // not standalone" grammar the trail's dashed strokes carry. The dash rides
  // inline (border-style is geometry, not colour, so nothing here escapes the
  // token file) with the width restated so the dash is the contract's 1.5px
  // whatever the stylesheet's border variable does; the modifier class above
  // is the stylesheet's hook if it ever wants more than a dash.
  const nestedStyle = nested ? ' style="border-style: dashed; border-width: 1.5px;"' : '';
  const glyph = categoryGlyphSvg(category, { size: CHIP_GLYPH_SIZE, color: TEXT_GLYPH_COLOR });
  // Same always-a-<span> shape as the pill, for the same reason.
  const html = `
    <button type="button" class="${classes.join(' ')}"${nestedStyle}${nameLabel(title, category)}>${glyph}<span>${escapeHtml(title)}</span></button>
  `;
  return L.divIcon({
    html,
    className: 'wend-pin-chip-icon',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -CHIP_HEIGHT / 2],
  });
}

/**
 * The quiet counterpart to `chipIcon`: a located idea that is NOT in the list
 * on screen. A small neutral circle — card tone, drawn edge, no state colour,
 * no name — so it registers as "something is here" without competing with the
 * chips. Still a real pin: clickable, selectable, and it clusters like any
 * other. The drawn mark is 12px but the button keeps the 32px hit area every
 * pointer target gets (architecture.md §5).
 */
export function dotIcon(title: string, selected: boolean): L.DivIcon {
  const classes = ['wend-pin-dot'];
  if (selected) classes.push('is-selected');
  const html = `
    <button type="button" class="${classes.join(' ')}" aria-label="${escapeHtml(title)}">
      <span aria-hidden="true"></span>
    </button>
  `;
  return L.divIcon({
    html,
    className: 'wend-pin-dot-icon',
    iconSize: [MARK_BOX, MARK_BOX],
    iconAnchor: [MARK_CENTER, MARK_CENTER],
    popupAnchor: [0, -MARK_CENTER],
  });
}

/**
 * The quietest mark of all (MapPin.mark='faint'): a pin the current filter
 * has set aside. It reuses the dot's markup wholesale — same neutral circle,
 * same 32px hit area, still clickable — and fades the whole button, because
 * "filtered out" must read as *dimmed*, never *gone*: a filter that removed
 * pins would make the map lie about what the trip holds. The fade is an
 * inline opacity rather than a stylesheet rule for the same reason the dash
 * on a nested chip is: opacity is not a colour, so nothing escapes the token
 * file, and the icon stays whole on its own. 0.6 is the floor: with the
 * `--text-strong` edge .wend-pin-faint gets in MapView.module.css (the other
 * half of this legibility) it keeps the faint edge at 3.11:1 over the tiles,
 * while still reading plainly dimmer than the full-opacity dot. No `selected`
 * argument — a pin the filter set aside is by definition not the one under
 * discussion.
 */
export function faintIcon(title: string): L.DivIcon {
  const html = `
    <button type="button" class="wend-pin-dot wend-pin-faint" style="opacity: 0.6;" aria-label="${escapeHtml(title)}">
      <span aria-hidden="true"></span>
    </button>
  `;
  return L.divIcon({
    html,
    className: 'wend-pin-dot-icon',
    iconSize: [MARK_BOX, MARK_BOX],
    iconAnchor: [MARK_CENTER, MARK_CENTER],
    popupAnchor: [0, -MARK_CENTER],
  });
}

/** A cluster mark: card tone, a count, no shadow, radius matches --radius-card. */
export function clusterIcon(count: number): L.DivIcon {
  const html = `
    <button type="button" class="wend-cluster" aria-label="${count} places here — open to zoom in">
      <span>${count}</span>
    </button>
  `;
  return L.divIcon({ html, className: 'wend-cluster-icon', iconSize: [36, 36], iconAnchor: [18, 18] });
}

/** The pending, not-yet-saved location while capturing a new idea — always apricot: "where you're deciding". */
export function pendingIcon(): L.DivIcon {
  const html = `
    <span class="wend-pending" aria-hidden="true">
      <svg width="${MARK_BOX}" height="${MARK_BOX}" viewBox="0 0 ${MARK_BOX} ${MARK_BOX}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${MARK_CENTER}" cy="${MARK_CENTER}" r="8" fill="none" stroke="var(--stop-open)" stroke-width="3" stroke-dasharray="3 4"/>
      </svg>
    </span>
  `;
  return L.divIcon({ html, className: 'wend-pending-icon', iconSize: [MARK_BOX, MARK_BOX], iconAnchor: [MARK_CENTER, MARK_CENTER] });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
