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

const ARCHIVED: DayVersion = {
  id: 9,
  trip_day_id: 1,
  name: 'Version B',
  position: 1,
  archived_at: '2026-09-01T10:00:00Z',
  schedule_items: [item(1, 'Kinkaku-ji')],
};

function renderPanel(open = false, archived = [{ version: ARCHIVED, label: 'Day 4 · Wed 15 · Version B' }]) {
  const onToggle = vi.fn();
  const onRestore = vi.fn();
  render(<ArchivedPanel archived={archived} open={open} onToggle={onToggle} onRestore={onRestore} />);
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
    expect(screen.getByText('09:00–11:00')).toBeInTheDocument();
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
});
