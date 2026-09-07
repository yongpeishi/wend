import { describe, expect, it } from 'vitest';
import { CATEGORY_GLYPH, categoryGlyphSvg } from './categoryGlyph';
import type { EntryCategory } from '../../api/types';

// The glyphs are markup strings destined for a Leaflet divIcon, so what is
// worth asserting is the contract that string carries: that every category the
// app can hold has a drawing, that an uncategorised pin gets nothing at all,
// and that no colour value ever escapes the token file into this markup.

const ALL_CATEGORIES: EntryCategory[] = ['place', 'food', 'activity', 'lodging', 'transport', 'other'];

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
