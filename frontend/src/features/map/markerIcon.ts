import L from 'leaflet';
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

// 32px square hit area — "never below 32x32 for pointer" (architecture.md
// §5). The visual mark stays Trail-scaled (an 8px-radius stop circle,
// matching <Trail>'s own dot sizes) and sits centred inside the larger button.
const PIN_BOX = 32;
const PIN_CENTER = PIN_BOX / 2;

/** A single pin, styled like the brand's own trail stop circles. */
export function pinIcon(state: PinState, selected: boolean, title: string): L.DivIcon {
  const ring = selected
    ? `<circle cx="${PIN_CENTER}" cy="${PIN_CENTER}" r="13" fill="none" stroke="var(--stop-open)" stroke-width="3"/>`
    : '';
  const label = `${title} — ${pinStateLabel(state)}`;
  const html = `
    <button type="button" class="wend-pin" aria-label="${escapeHtml(label)}">
      <svg width="${PIN_BOX}" height="${PIN_BOX}" viewBox="0 0 ${PIN_BOX} ${PIN_BOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        ${ring}
        <circle cx="${PIN_CENTER}" cy="${PIN_CENTER}" r="8" fill="${FILL[state]}" stroke="var(--surface-card)" stroke-width="2"/>
      </svg>
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

/** Matches the pill's rendered height in MapView.module.css — only used to lift the popup clear of it. */
const LABEL_HEIGHT = 28;

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
export function labelIcon(title: string, tone: PinTone | undefined, selected: boolean): L.DivIcon {
  const classes = ['wend-pin-label'];
  // No tone means no opinion, and the base class already resting-tones itself —
  // so an untoned pin is not silently reported as "off view".
  if (tone) classes.push(TONE_CLASS[tone]);
  if (selected) classes.push('is-selected');
  const html = `
    <button type="button" class="${classes.join(' ')}">${escapeHtml(title)}</button>
  `;
  return L.divIcon({
    html,
    className: 'wend-pin-label-icon',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -LABEL_HEIGHT / 2],
  });
}

/** Matches the chip's rendered height in MapView.module.css — 13px text + 4px×2 padding + 1.5px×2 border. */
const CHIP_HEIGHT = 24;

/**
 * The labelled chip pin — the board's "this one is in the list you're reading"
 * mark. Same 0x0-anchor-and-CSS-centring trick as `labelIcon`, and for the
 * same reason: the chip is as wide as its title, which nothing can measure
 * before it is in the document. Colour is fixed (leaf on paper) rather than
 * toned, because the chip/dot split *is* the message — a second colour axis on
 * top of it would be two encodings fighting over one pill.
 */
export function chipIcon(title: string, selected: boolean, nested?: boolean): L.DivIcon {
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
  const html = `
    <button type="button" class="${classes.join(' ')}"${nestedStyle}>${escapeHtml(title)}</button>
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
    iconSize: [PIN_BOX, PIN_BOX],
    iconAnchor: [PIN_CENTER, PIN_CENTER],
    popupAnchor: [0, -PIN_CENTER],
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
 * file, and the icon stays whole on its own. No `selected` argument — a pin
 * the filter set aside is by definition not the one under discussion.
 */
export function faintIcon(title: string): L.DivIcon {
  const html = `
    <button type="button" class="wend-pin-dot wend-pin-faint" style="opacity: 0.45;" aria-label="${escapeHtml(title)}">
      <span aria-hidden="true"></span>
    </button>
  `;
  return L.divIcon({
    html,
    className: 'wend-pin-dot-icon',
    iconSize: [PIN_BOX, PIN_BOX],
    iconAnchor: [PIN_CENTER, PIN_CENTER],
    popupAnchor: [0, -PIN_CENTER],
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
      <svg width="${PIN_BOX}" height="${PIN_BOX}" viewBox="0 0 ${PIN_BOX} ${PIN_BOX}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${PIN_CENTER}" cy="${PIN_CENTER}" r="8" fill="none" stroke="var(--stop-open)" stroke-width="3" stroke-dasharray="3 4"/>
      </svg>
    </span>
  `;
  return L.divIcon({ html, className: 'wend-pending-icon', iconSize: [PIN_BOX, PIN_BOX], iconAnchor: [PIN_CENTER, PIN_CENTER] });
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
