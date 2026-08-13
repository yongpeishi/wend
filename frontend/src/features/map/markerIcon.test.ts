import { describe, expect, it } from 'vitest';
import type { DivIcon } from 'leaflet';
import { clusterIcon, labelIcon, pinIcon } from './markerIcon';

// The icons are HTML strings handed to Leaflet, so the only thing worth
// asserting is the contract that string carries: which classes the stylesheet
// will match on, and that nothing user-typed reaches the markup unescaped.
// (Colours are deliberately absent from these files — see MapView.module.css.)

function html(icon: DivIcon): string {
  return String(icon.options.html);
}

describe('labelIcon', () => {
  it('shows the entry title as the pill text', () => {
    expect(html(labelIcon('Fushimi Inari', 'inView', false))).toContain('>Fushimi Inari<');
  });

  it('escapes a title that contains markup rather than rendering it', () => {
    const markup = html(labelIcon('<script>alert(1)</script>', 'inView', false));
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('&lt;script&gt;');
  });

  it('carries the tone as a modifier class the stylesheet colours', () => {
    expect(html(labelIcon('A', 'bundled', false))).toContain('wend-pin-label--bundled');
    expect(html(labelIcon('A', 'inView', false))).toContain('wend-pin-label--in-view');
    expect(html(labelIcon('A', 'offView', false))).toContain('wend-pin-label--off-view');
  });

  it('adds no tone modifier at all when the caller has no opinion', () => {
    const markup = html(labelIcon('A', undefined, false));
    expect(markup).toContain('wend-pin-label');
    expect(markup).not.toContain('wend-pin-label--');
  });

  it('marks the selected pin, and only the selected pin, as selected', () => {
    expect(html(labelIcon('A', 'inView', true))).toContain('is-selected');
    expect(html(labelIcon('A', 'inView', false))).not.toContain('is-selected');
  });

  it('anchors at a point rather than a box, since the pill is as wide as its title', () => {
    const icon = labelIcon('A somewhat long place name', 'offView', false);
    expect(icon.options.iconSize).toEqual([0, 0]);
    expect(icon.options.iconAnchor).toEqual([0, 0]);
  });

  it('leaves the marker pin untouched — the two variants share no markup', () => {
    const marker = html(pinIcon('scheduled', false, 'Fushimi Inari'));
    expect(marker).toContain('wend-pin');
    expect(marker).not.toContain('wend-pin-label');
  });
});

describe('clusterIcon', () => {
  it('looks the same in either pin variant — clusters are counts, not places', () => {
    const markup = html(clusterIcon(4));
    expect(markup).toContain('wend-cluster');
    expect(markup).toContain('>4<');
  });
});
