import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VotePill } from './VotePill';
import type { EntryCategory } from '../../api/types';

const SCALE = "Everyone's votes added up, from +2 to -2 each";

interface PillOptions {
  category?: EntryCategory | null;
  total?: number;
  className?: string;
}

function renderPill(options: PillOptions = {}) {
  return render(
    <VotePill
      category={options.category === undefined ? 'place' : options.category}
      total={options.total ?? 0}
      className={options.className}
    />,
  );
}

/** The pill, found by the scale it spells out — as every screen finds it. */
function pill() {
  return screen.getByTitle(SCALE);
}

describe('VotePill — what it says', () => {
  it('says nothing at all with no category and no votes', () => {
    const { container } = renderPill({ category: null, total: 0 });

    expect(screen.queryByTitle(SCALE)).not.toBeInTheDocument();
    // Not an empty plum box either: nothing to say means nothing rendered.
    expect(container).toBeEmptyDOMElement();
  });

  it('draws no scoreboard on an idea nobody has judged — the category stands alone', () => {
    renderPill({ category: 'place', total: 0 });

    expect(pill()).toHaveTextContent(/^Place$/);
  });

  it('carries category and tally together when anyone is keen', () => {
    renderPill({ category: 'food', total: 5 });

    // The thumb between them is aria-hidden SVG, so the pill's words are the
    // label and the number, side by side.
    expect(pill()).toHaveTextContent('Food·5');
  });

  it('lets a negative total carry its own minus sign', () => {
    renderPill({ category: 'transport', total: -2 });

    expect(pill()).toHaveTextContent('Transport·-2');
  });

  it('drops the separator when the votes are all there is to say', () => {
    renderPill({ category: null, total: 3 });

    expect(pill()).toHaveTextContent(/^3$/);
  });

  it('spells the scale out for anyone who wonders what the number is', () => {
    renderPill({ total: 4 });

    expect(screen.getByTitle(SCALE)).toBeInTheDocument();
  });

  // The pill owns its look; a caller may add layout beside it and nothing else.
  it('keeps its own class while wearing the caller’s', () => {
    renderPill({ total: 4, className: 'nudged' });

    expect(pill().className).toContain('nudged');
    expect(pill().className.split(' ').length).toBe(2);
  });
});
