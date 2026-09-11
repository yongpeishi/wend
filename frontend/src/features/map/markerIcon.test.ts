import { describe, expect, it } from 'vitest';
import type { DivIcon } from 'leaflet';
import type { EntryCategory } from '../../api/types';
import { CATEGORY_GLYPH } from './categoryGlyph';
import {
  PIN_NAME_OFFSET,
  chipIcon,
  clusterIcon,
  dotIcon,
  faintIcon,
  labelIcon,
  nameOpensLeft,
  pendingIcon,
  pinIcon,
} from './markerIcon';

// The icons are HTML strings handed to Leaflet, so the only thing worth
// asserting is the contract that string carries: which classes the stylesheet
// will match on, and that nothing user-typed reaches the markup unescaped.
// (Colour values are deliberately absent from these files — pins name design
// tokens via var() and nothing more; the values live in MapView.module.css.)

function html(icon: DivIcon): string {
  return String(icon.options.html);
}

/** In the order the category filter lists them. */
const CATEGORIES: EntryCategory[] = ['place', 'food', 'activity', 'lodging', 'transport', 'other'];

/** The words CATEGORY_LABELS speaks, restated here so a rename has to be deliberate. */
const CATEGORY_WORD: Record<EntryCategory, string> = {
  place: 'Place',
  food: 'Food',
  activity: 'Activity',
  lodging: 'Lodging',
  transport: 'Transport',
  other: 'Other',
};

/** The colour the glyph itself is stroked in, read off the one <svg> that carries the glyph class. */
function glyphStroke(markup: string): string | undefined {
  return /class="wend-pin-glyph"[^>]*\sstroke="([^"]+)"/.exec(markup)?.[1];
}

// The stop circle's geometry, named so the "ring sits outside the disc"
// relationship is asserted as arithmetic rather than as two unrelated strings.
const DISC_RADIUS = 14;
const RING_RADIUS = 18.5;
const RING_STROKE = 3;

describe('pinIcon', () => {
  it('rings the potential pin in leaf so its pale fill has a legible edge', () => {
    const markup = html(pinIcon('potential', false, 'Fushimi Inari'));
    expect(markup).toContain('fill="var(--stop-waiting)"');
    expect(markup).toContain('stroke="var(--stop-decided)"');
    expect(markup).toContain('stroke-width="2"');
  });

  it('keeps the scheduled pin solid leaf with the card-tone halo', () => {
    const markup = html(pinIcon('scheduled', false, 'Fushimi Inari'));
    expect(markup).toContain('fill="var(--stop-decided)"');
    expect(markup).toContain('stroke="var(--surface-card)"');
  });

  it('keeps the destination pin solid with the card-tone halo', () => {
    const markup = html(pinIcon('destination', false, 'Fushimi Inari'));
    expect(markup).toContain('fill="var(--stop-destination)"');
    expect(markup).toContain('stroke="var(--surface-card)"');
  });

  it('draws the apricot selection ring only around the selected pin', () => {
    expect(html(pinIcon('potential', true, 'A'))).toContain('stroke="var(--stop-open)"');
    expect(html(pinIcon('potential', false, 'A'))).not.toContain('stroke="var(--stop-open)"');
    expect(html(pinIcon('scheduled', false, 'A'))).not.toContain('stroke="var(--stop-open)"');
  });

  it('rings the selected pin 3px off the disc, the way focus does everywhere else', () => {
    const markup = html(pinIcon('scheduled', true, 'A'));
    expect(markup).toContain(`r="${DISC_RADIUS}"`);
    expect(markup).toContain(`r="${RING_RADIUS}" fill="none" stroke="var(--stop-open)" stroke-width="${RING_STROKE}"`);
    // The design draws the ring as a 3px outline at 3px offset around the
    // 28px disc. Stroked at 3, a radius of 18.5 puts the inner edge at 17 —
    // three pixels of paper outside the 14 disc — and the outer edge at 20,
    // exactly the 40px box's edge.
    expect(RING_RADIUS - RING_STROKE / 2 - DISC_RADIUS).toBe(3);
    expect(RING_RADIUS + RING_STROKE / 2).toBe(20);
  });
});

describe('the hover name on the stop circle', () => {
  // The design's Option A: hovering (or focusing) a marker opens its name. The
  // markup's half of that is a span the stylesheet reveals; these assert the
  // span is there, says the right thing, and is invisible to a screen reader,
  // which already gets the title from the button's aria-label.

  it('carries the title in a name span, after the drawing', () => {
    const markup = html(pinIcon('scheduled', false, 'Fushimi Inari'));
    expect(markup).toContain('<span class="wend-pin-name" aria-hidden="true">Fushimi Inari</span>');
    expect(markup.indexOf('</svg>')).toBeLessThan(markup.indexOf('wend-pin-name'));
  });

  it('is aria-hidden, so the name is not read out twice', () => {
    const markup = html(pinIcon('scheduled', false, 'Fushimi Inari'));
    expect(markup).toMatch(/class="wend-pin-name" aria-hidden="true"/);
    expect(markup).toContain('aria-label="Fushimi Inari — Scheduled"');
  });

  it('escapes a title that contains markup rather than rendering it', () => {
    const markup = html(pinIcon('scheduled', false, '<b>Bold</b>'));
    expect(markup).not.toContain('<b>');
    expect(markup).toContain('&lt;b&gt;Bold&lt;/b&gt;');
  });

  it('is the stop circle\'s alone — the chip, dot and name pill already show their title', () => {
    expect(html(chipIcon('A', false))).not.toContain('wend-pin-name');
    expect(html(dotIcon('A', false))).not.toContain('wend-pin-name');
    expect(html(faintIcon('A'))).not.toContain('wend-pin-name');
    expect(html(labelIcon('A', 'inView', false))).not.toContain('wend-pin-name');
  });

  it('opens 6px off the disc edge — the stylesheet\'s 20px and this constant are one number', () => {
    expect(PIN_NAME_OFFSET).toBe(DISC_RADIUS + 6);
  });

  it('opens to the left only when it would run past the map\'s right edge', () => {
    // A 600px-wide map, an 80px name: the name needs pinX + 20 + 80 to fit.
    expect(nameOpensLeft(100, 600, 80)).toBe(false);
    expect(nameOpensLeft(500, 600, 80)).toBe(false);
    expect(nameOpensLeft(501, 600, 80)).toBe(true);
    expect(nameOpensLeft(590, 600, 80)).toBe(true);
  });

  it('never flips a name that fits, however wide the map', () => {
    expect(nameOpensLeft(0, 10_000, 200)).toBe(false);
  });
});

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

describe('chipIcon', () => {
  it('shows the entry title as the chip text', () => {
    expect(html(chipIcon('Fushimi Inari', false))).toContain('>Fushimi Inari<');
  });

  it('escapes a title that contains markup rather than rendering it', () => {
    const markup = html(chipIcon('<script>alert(1)</script>', false));
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('&lt;script&gt;');
  });

  it('carries no tone modifier — the chip/dot split is the whole message', () => {
    expect(html(chipIcon('A', false))).not.toContain('wend-pin-label--');
  });

  it('marks the selected chip, and only the selected chip, as selected', () => {
    expect(html(chipIcon('A', true))).toContain('is-selected');
    expect(html(chipIcon('A', false))).not.toContain('is-selected');
  });

  it('anchors at a point rather than a box, since the chip is as wide as its title', () => {
    const icon = chipIcon('A somewhat long place name', false);
    expect(icon.options.iconSize).toEqual([0, 0]);
    expect(icon.options.iconAnchor).toEqual([0, 0]);
  });

  it('dashes the edge, at 1.5px, when the place is nested inside another kept thing', () => {
    const markup = html(chipIcon('A', false, true));
    expect(markup).toContain('wend-pin-chip--nested');
    expect(markup).toContain('border-style: dashed');
    expect(markup).toContain('border-width: 1.5px');
  });

  it('draws a plain solid edge for the two-argument call every existing caller makes', () => {
    const markup = html(chipIcon('A', false));
    expect(markup).not.toContain('wend-pin-chip--nested');
    expect(markup).not.toContain('dashed');
  });
});

describe('dotIcon', () => {
  it('names the place for a screen reader without drawing the name', () => {
    const markup = html(dotIcon('Fushimi Inari', false));
    expect(markup).toContain('aria-label="Fushimi Inari"');
    expect(markup).not.toContain('>Fushimi Inari<');
  });

  it('escapes a title that contains markup rather than rendering it', () => {
    const markup = html(dotIcon('<script>alert(1)</script>', false));
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('&lt;script&gt;');
  });

  it('is a real button — dots stay clickable like every other pin', () => {
    expect(html(dotIcon('A', false))).toContain('<button type="button"');
  });

  it('keeps the 32px hit area even though the drawn mark is 12px', () => {
    const icon = dotIcon('A', false);
    expect(icon.options.iconSize).toEqual([32, 32]);
    expect(icon.options.iconAnchor).toEqual([16, 16]);
  });

  it('marks the selected dot, and only the selected dot, as selected', () => {
    expect(html(dotIcon('A', true))).toContain('is-selected');
    expect(html(dotIcon('A', false))).not.toContain('is-selected');
  });
});

describe('faintIcon', () => {
  it('reuses the dot markup — same neutral circle, faded rather than removed', () => {
    const markup = html(faintIcon('Fushimi Inari'));
    expect(markup).toContain('wend-pin-dot');
    expect(markup).toContain('wend-pin-faint');
    expect(markup).toContain('opacity: 0.6');
  });

  it('names the place for a screen reader without drawing the name', () => {
    const markup = html(faintIcon('Fushimi Inari'));
    expect(markup).toContain('aria-label="Fushimi Inari"');
    expect(markup).not.toContain('>Fushimi Inari<');
  });

  it('escapes a title that contains markup rather than rendering it', () => {
    const markup = html(faintIcon('<script>alert(1)</script>'));
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('&lt;script&gt;');
  });

  it('stays a real button with the full 32px hit area — filtered out is not gone', () => {
    const icon = faintIcon('A');
    expect(html(icon)).toContain('<button type="button"');
    expect(icon.options.iconSize).toEqual([32, 32]);
    expect(icon.options.iconAnchor).toEqual([16, 16]);
  });
});

describe('clusterIcon', () => {
  it('looks the same in either pin variant — clusters are counts, not places', () => {
    const markup = html(clusterIcon(4));
    expect(markup).toContain('wend-cluster');
    expect(markup).toContain('>4<');
  });
});

describe('the category glyph', () => {
  it.each(CATEGORIES)('draws the %s glyph inside the stop circle', (category) => {
    const markup = html(pinIcon('scheduled', false, 'Fushimi Inari', category));
    expect(markup).toContain('wend-pin-glyph');
    expect(markup).toContain(CATEGORY_GLYPH[category]);
  });

  it.each(CATEGORIES)('draws the %s glyph in front of the chip title', (category) => {
    const markup = html(chipIcon('Fushimi Inari', false, false, category));
    expect(markup).toContain(CATEGORY_GLYPH[category]);
    // Glyph first, then the name — the chip reads left to right like a label.
    expect(markup.indexOf('wend-pin-glyph')).toBeLessThan(markup.indexOf('>Fushimi Inari<'));
  });

  it.each(CATEGORIES)('draws the %s glyph in front of the name pill title', (category) => {
    const markup = html(labelIcon('Fushimi Inari', 'inView', false, category));
    expect(markup).toContain(CATEGORY_GLYPH[category]);
    expect(markup.indexOf('wend-pin-glyph')).toBeLessThan(markup.indexOf('>Fushimi Inari<'));
  });

  it('tells the six categories apart — no two draw the same glyph', () => {
    const drawn = CATEGORIES.map((category) => CATEGORY_GLYPH[category]);
    expect(new Set(drawn).size).toBe(CATEGORIES.length);
  });

  it('sizes the glyph to the thing it sits in — 16 in the pin and the pill, 14 in the smaller chip', () => {
    expect(html(pinIcon('scheduled', false, 'A', 'food'))).toContain('width="16" height="16"');
    expect(html(labelIcon('A', 'inView', false, 'food'))).toContain('width="16" height="16"');
    expect(html(chipIcon('A', false, false, 'food'))).toContain('width="14" height="14"');
  });

  it('centres the pin glyph with a wrapping <g>, since a nested <svg> would sit in the corner', () => {
    const markup = html(pinIcon('scheduled', false, 'A', 'lodging'));
    // 20 (the 40px box's centre) less half the 16px glyph.
    expect(markup).toContain('<g transform="translate(12, 12)">');
  });

  it('paints the glyph in currentColor on the chip and pill, so it follows every tone the stylesheet sets', () => {
    expect(glyphStroke(html(chipIcon('A', false, false, 'food')))).toBe('currentColor');
    for (const tone of ['bundled', 'inView', 'offView'] as const) {
      expect(glyphStroke(html(labelIcon('A', tone, false, 'food')))).toBe('currentColor');
    }
  });

  it('knocks the glyph out in paper on the two solid pins, and inverts it to leaf on the pale one', () => {
    // A pale fill cannot carry a paper glyph, so `potential` alone inverts.
    expect(glyphStroke(html(pinIcon('scheduled', false, 'A', 'food')))).toBe('var(--surface-card)');
    expect(glyphStroke(html(pinIcon('destination', false, 'A', 'food')))).toBe('var(--surface-card)');
    expect(glyphStroke(html(pinIcon('potential', false, 'A', 'food')))).toBe('var(--stop-decided)');
  });

  it('names the category in words as well as in a drawing, on all three marks', () => {
    expect(html(pinIcon('scheduled', false, 'Fushimi Inari', 'food'))).toContain(
      'aria-label="Fushimi Inari — Food — Scheduled"',
    );
    expect(html(chipIcon('Fushimi Inari', false, false, 'lodging'))).toContain(
      'aria-label="Fushimi Inari — Lodging"',
    );
    expect(html(labelIcon('Fushimi Inari', 'inView', false, 'transport'))).toContain(
      'aria-label="Fushimi Inari — Transport"',
    );
  });

  it.each(CATEGORIES)('speaks %s as a word, never as a filter key', (category) => {
    expect(html(pinIcon('scheduled', false, 'A', category))).toContain(
      `aria-label="A — ${CATEGORY_WORD[category]} — Scheduled"`,
    );
  });

  it('keeps escaping a title that contains markup once a glyph is beside it', () => {
    const nasty = '<b>Ben & Jerry\'s "best"</b>';
    for (const markup of [
      html(pinIcon('scheduled', false, nasty, 'food')),
      html(chipIcon(nasty, false, false, 'food')),
      html(labelIcon(nasty, 'inView', false, 'food')),
    ]) {
      expect(markup).not.toContain('<b>');
      expect(markup).toContain('&lt;b&gt;');
      expect(markup).toContain('&amp;');
      expect(markup).toContain('&quot;');
      expect(markup).toContain('&#39;');
    }
  });

  it('names no colour of its own — every colour in the markup is still a token or currentColor', () => {
    for (const category of CATEGORIES) {
      for (const markup of [
        html(pinIcon('potential', true, 'Fushimi Inari', category)),
        html(chipIcon('Fushimi Inari', true, true, category)),
        html(labelIcon('Fushimi Inari', 'bundled', true, category)),
      ]) {
        expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}/);
        expect(markup).not.toMatch(/\brgba?\(/);
      }
    }
  });
});

describe('an uncategorised pin', () => {
  // The regression that matters: most pins have no category (NearbyPanel's
  // never do), and every one of them must draw exactly as it drew before this
  // file learned the word.

  it('draws no glyph at all on any of the three marks', () => {
    for (const markup of [
      html(pinIcon('scheduled', false, 'Fushimi Inari')),
      html(chipIcon('Fushimi Inari', false)),
      html(labelIcon('Fushimi Inari', 'inView', false)),
    ]) {
      expect(markup).not.toContain('wend-pin-glyph');
      expect(markup).not.toContain('<g transform');
    }
  });

  it('leaves the chip and the pill with no aria-label, so the visible title is still the accessible name', () => {
    expect(html(chipIcon('Fushimi Inari', false))).not.toContain('aria-label');
    expect(html(labelIcon('Fushimi Inari', 'inView', false))).not.toContain('aria-label');
  });

  it('leaves the marker pin saying title and state, exactly as before', () => {
    expect(html(pinIcon('scheduled', false, 'Fushimi Inari'))).toContain(
      'aria-label="Fushimi Inari — Scheduled"',
    );
  });

  it('treats an explicit null or undefined the same as leaving the argument off', () => {
    expect(html(pinIcon('scheduled', false, 'A', null))).toBe(html(pinIcon('scheduled', false, 'A')));
    expect(html(pinIcon('scheduled', false, 'A', undefined))).toBe(html(pinIcon('scheduled', false, 'A')));
    expect(html(chipIcon('A', false, false, null))).toBe(html(chipIcon('A', false, false)));
    expect(html(labelIcon('A', 'inView', false, null))).toBe(html(labelIcon('A', 'inView', false)));
  });

  it('still wraps the title in a span, categorised or not, so the stylesheet has one shape to lay out', () => {
    expect(html(chipIcon('Fushimi Inari', false))).toContain('<span>Fushimi Inari</span>');
    expect(html(labelIcon('Fushimi Inari', 'inView', false))).toContain('<span>Fushimi Inari</span>');
  });
});

describe('the two box constants', () => {
  // pinIcon's box had to grow for the glyph; the other three marks share a
  // constant with a hard-coded 32px in MapView.module.css. Re-merging the two
  // would silently resize the dot, the faint dot and the pending ring, and
  // nothing on screen would say so. This is the test that would say so.

  it('gives the grown stop circle a 40px box', () => {
    const icon = pinIcon('scheduled', false, 'A', 'food');
    expect(icon.options.iconSize).toEqual([40, 40]);
    expect(icon.options.iconAnchor).toEqual([20, 20]);
    expect(html(icon)).toContain('viewBox="0 0 40 40"');
  });

  it('leaves the dot, the faint dot and the pending ring at 32', () => {
    expect(dotIcon('A', false).options.iconSize).toEqual([32, 32]);
    expect(faintIcon('A').options.iconSize).toEqual([32, 32]);
    expect(pendingIcon().options.iconSize).toEqual([32, 32]);
    expect(pendingIcon().options.iconAnchor).toEqual([16, 16]);
    expect(html(pendingIcon())).toContain('viewBox="0 0 32 32"');
  });
});
