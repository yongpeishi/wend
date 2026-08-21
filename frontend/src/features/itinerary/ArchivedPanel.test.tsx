import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DayVersion, ItineraryItem } from '../../api/types';
import { ArchivedPanel } from './ArchivedPanel';

function item(id: number, title: string): ItineraryItem {
  return {
    id,
    trip_id: 1,
    entry_id: id,
    chosen_entry_id: null,
    day: '2026-10-15',
    day_version_id: 9,
    starts_at_minutes: 9 * 60,
    ends_at_minutes: 11 * 60,
    note: null,
    position: 0,
    entry: { id, kind: 'idea', title, category: 'place', duration_minutes: 120, location_name: 'Kyoto west' },
    members: [],
  };
}

/** A second, later thing, so the version has a span wider than one item. */
function afternoon(id: number, title: string): ItineraryItem {
  return { ...item(id, title), starts_at_minutes: 13 * 60, ends_at_minutes: 15 * 60 };
}

/** A bundle, whose band and members the panel must not draw. */
function bundle(id: number, title: string): ItineraryItem {
  const base = item(id, title);
  return {
    ...base,
    starts_at_minutes: 11 * 60,
    ends_at_minutes: 13 * 60,
    entry: { ...base.entry!, kind: 'bundle' },
    members: [
      { id: 91, kind: 'idea', title: 'Teramachi arcade', category: 'place', duration_minutes: 30, location_name: 'Teramachi' },
    ],
  };
}

const ARCHIVED: DayVersion = {
  id: 9,
  trip_day_id: 1,
  name: 'Version B',
  position: 1,
  archived_at: '2026-09-01T10:00:00Z',
  schedule_items: [item(1, 'Kinkaku-ji')],
};

function renderPanel(
  open = false,
  archived = [{ version: ARCHIVED, label: 'Day 4 · Wed 15 · Version B' }],
  readOnly = false,
) {
  const onToggle = vi.fn();
  const onRestore = vi.fn();
  render(
    <ArchivedPanel
      archived={archived}
      open={open}
      onToggle={onToggle}
      onRestore={onRestore}
      readOnly={readOnly}
    />,
  );
  return { onToggle, onRestore };
}

describe('ArchivedPanel', () => {
  it('is not there at all until something has been set aside', () => {
    const { container } = render(
      <ArchivedPanel archived={[]} open onToggle={() => {}} onRestore={() => {}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('counts what is archived without opening it — it is rarely reached', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderPanel(false);

    const toggle = screen.getByRole('button', { name: /Archived · 1/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Day 4 · Wed 15 · Version B')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(onToggle).toHaveBeenCalled();
  });

  it('says which day each archived version belonged to', () => {
    renderPanel(true);

    expect(screen.getByText('Day 4 · Wed 15 · Version B')).toBeInTheDocument();
  });

  it('shows what was in it, so you can tell why you kept it', () => {
    renderPanel(true);

    expect(screen.getByText('Kinkaku-ji')).toBeInTheDocument();
    expect(screen.getByText('09:00–11:00 · 1 thing')).toBeInTheDocument();
  });

  // The rail is 300px. The day's own row language — a 104px mono column, a
  // title, right-aligned metadata — does not fit in it, so this summarises
  // rather than replaying the running order.
  it('summarises the version instead of redrawing the day inside a 300px rail', () => {
    renderPanel(true, [
      {
        version: {
          ...ARCHIVED,
          schedule_items: [item(1, 'Kinkaku-ji'), afternoon(2, 'Nishiki market')],
        },
        label: 'Day 4 · Wed 15 · Version B',
      },
    ]);

    // One span for the whole version, one count, one list of titles.
    expect(screen.getByText('09:00–15:00 · 2 things')).toBeInTheDocument();
    expect(screen.getByText('Kinkaku-ji · Nishiki market')).toBeInTheDocument();
    // No per-item time column, and so nothing to collide with a title.
    expect(screen.queryByText('09:00–11:00')).not.toBeInTheDocument();
    expect(screen.queryByText('13:00–15:00')).not.toBeInTheDocument();
  });

  // A hole in a plan you already set aside is not a hole you can fill.
  it('draws no gap rows and no bundle bands', () => {
    renderPanel(true, [
      {
        version: {
          ...ARCHIVED,
          schedule_items: [item(1, 'Kinkaku-ji'), bundle(3, 'Nishiki market crawl')],
        },
        label: 'Day 4 · Wed 15 · Version B',
      },
    ]);

    expect(screen.queryByText(/Nothing planned/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Plan ·/)).not.toBeInTheDocument();
    expect(screen.queryByText('Teramachi arcade')).not.toBeInTheDocument();
    expect(screen.getByText('Kinkaku-ji · Nishiki market crawl')).toBeInTheDocument();
  });

  it('says plainly when a version had nothing on it at all', () => {
    renderPanel(true, [
      { version: { ...ARCHIVED, schedule_items: [] }, label: 'Day 4 · Wed 15 · Version B' },
    ]);

    expect(screen.getByText('Nothing was on it.')).toBeInTheDocument();
  });

  it('shows an archived version, never edits it', () => {
    renderPanel(true);

    expect(screen.queryByRole('button', { name: /Take Kinkaku-ji off this day/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hours for Kinkaku-ji/ })).not.toBeInTheDocument();
  });

  it('brings one back as a live version again', async () => {
    const user = userEvent.setup();
    const { onRestore } = renderPanel(true);

    await user.click(screen.getByRole('button', { name: 'Bring back Day 4 · Wed 15 · Version B' }));

    expect(onRestore).toHaveBeenCalledWith(9);
  });

  // What a trip set aside is part of reading the trip, so a viewer keeps the
  // count, the disclosure and every summary in it. Only the way back goes:
  // bringing a version back is a change to the day it came from.
  it('still says what was set aside to someone who cannot bring it back', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderPanel(true, undefined, true);

    expect(screen.getByRole('button', { name: /Archived · 1/ })).toBeInTheDocument();
    expect(screen.getByText('Day 4 · Wed 15 · Version B')).toBeInTheDocument();
    expect(screen.getByText('09:00–11:00 · 1 thing')).toBeInTheDocument();
    expect(screen.getByText('Kinkaku-ji')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Bring back/ })).not.toBeInTheDocument();

    // The disclosure itself is reading, not writing.
    await user.click(screen.getByRole('button', { name: /Archived · 1/ }));
    expect(onToggle).toHaveBeenCalled();
  });
});
