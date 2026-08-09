import L from 'leaflet';
import type { PinState } from './types';
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
