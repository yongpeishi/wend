import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Asterisk, Bed, Camera, Footprints, TrainFront, Utensils } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CATEGORY_GLYPH, categoryGlyphSvg } from './categoryGlyph';
import type { EntryCategory } from '../../api/types';

// The glyphs are markup strings destined for a Leaflet divIcon, so what is
// worth asserting is the contract that string carries: that every category the
// app can hold has a drawing, that an uncategorised pin gets nothing at all,
// and that no colour value ever escapes the token file into this markup.

const ALL_CATEGORIES: EntryCategory[] = ['place', 'food', 'activity', 'lodging', 'transport', 'other'];

/**
 * The set the feedback-15 design settled on, one Lucide component per
 * category. The transcription in categoryGlyph.ts has to be *these* icons and
 * no others — Landmark, UtensilsCrossed and Ticket were the runners-up, and
 * a hand copy is the easiest place for a runner-up to slip in.
 */
const DESIGN_SET: Record<EntryCategory, LucideIcon> = {
  place: Camera,
  food: Utensils,
  activity: Footprints,
  lodging: Bed,
  transport: TrainFront,
  other: Asterisk,
};

/**
 * The shapes inside an <svg>, as "tag attr=value …" strings in document order,
 * attributes sorted — so React's attribute ordering and our hand-written
 * closing tags do not count as differences, while any change to the geometry
 * does.
 */
function shapes(svgMarkup: string): string[] {
  const svg = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml').documentElement;
  return Array.from(svg.children).map((el) => {
    const attrs = Array.from(el.attributes)
      .filter((a) => a.name !== 'key')
      .map((a) => `${a.name}=${a.value}`)
      .sort();
    return `${el.tagName} ${attrs.join(' ')}`;
  });
}

describe('the settled set', () => {
  it.each(ALL_CATEGORIES)('draws %s with the Lucide icon the design chose, stroke for stroke', (category) => {
    const Icon = DESIGN_SET[category];
    const rendered = renderToStaticMarkup(<Icon />);
    const transcribed = `<svg xmlns="http://www.w3.org/2000/svg">${CATEGORY_GLYPH[category]}</svg>`;
    // Guard against comparing two empty lists: every icon in the set has at least one shape.
    expect(shapes(rendered).length).toBeGreaterThan(0);
    expect(shapes(transcribed)).toEqual(shapes(rendered));
  });
});

describe('CATEGORY_GLYPH', () => {
  it('draws every category the app can hold, and nothing it cannot', () => {
    expect(Object.keys(CATEGORY_GLYPH).sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  it('gives each category real path markup rather than an empty placeholder', () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_GLYPH[category]).toContain('<path');
      expect(CATEGORY_GLYPH[category].length).toBeGreaterThan(0);
    }
  });

  it('holds inner markup only — the <svg> wrapper is the builder\'s job', () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_GLYPH[category]).not.toContain('<svg');
    }
  });
});

describe('categoryGlyphSvg', () => {
  it('draws nothing for an uncategorised pin, so the mark stays exactly as it is today', () => {
    expect(categoryGlyphSvg(null, { size: 16, color: 'currentColor' })).toBe('');
    expect(categoryGlyphSvg(undefined, { size: 16, color: 'currentColor' })).toBe('');
  });

  it('wraps the glyph in a complete <svg> for every category', () => {
    for (const category of ALL_CATEGORIES) {
      const markup = categoryGlyphSvg(category, { size: 16, color: 'currentColor' });
      expect(markup).toContain('<svg');
      expect(markup).toContain('</svg>');
      expect(markup).toContain(CATEGORY_GLYPH[category]);
    }
  });

  it('carries the size, colour and stroke width it was handed', () => {
    const markup = categoryGlyphSvg('food', { size: 14, color: 'var(--surface-card)', strokeWidth: 1.5 });
    expect(markup).toContain('width="14"');
    expect(markup).toContain('height="14"');
    expect(markup).toContain('stroke="var(--surface-card)"');
    expect(markup).toContain('stroke-width="1.5"');
  });

  it('defaults the stroke to 2 — the map\'s weight, because 1.5 vanishes over tiles', () => {
    expect(categoryGlyphSvg('place', { size: 16, color: 'currentColor' })).toContain('stroke-width="2"');
  });

  it('keeps Lucide\'s 24-unit grid and rounded, unfilled strokes', () => {
    const markup = categoryGlyphSvg('transport', { size: 16, color: 'currentColor' });
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('fill="none"');
    expect(markup).toContain('stroke-linecap="round"');
    expect(markup).toContain('stroke-linejoin="round"');
  });

  it('hides the glyph from screen readers — the marker\'s aria-label says the category in words', () => {
    for (const category of ALL_CATEGORIES) {
      expect(categoryGlyphSvg(category, { size: 16, color: 'currentColor' })).toContain('aria-hidden="true"');
    }
  });

  it('names no colour of its own — colour never escapes the token file', () => {
    const everything = [
      ...ALL_CATEGORIES.map((category) => CATEGORY_GLYPH[category]),
      ...ALL_CATEGORIES.map((category) => categoryGlyphSvg(category, { size: 16, color: 'var(--stop-decided)' })),
    ].join('');
    expect(everything).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
