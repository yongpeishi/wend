import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Entry } from '../../api/types';
import type { EntryGroup } from '../board/filters';
import { MapIdeaList } from './MapIdeaList';
import type { MapIdeaListProps } from './MapIdeaList';

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    kind: 'idea',
    title: 'Untitled',
    description: null,
    category: null,
    starts_on: null,
    ends_on: null,
    address: null,
    lat: null,
    lng: null,
    duration_minutes: null,
    source_url: null,
    notes: null,
    from_entry_id: null,
    to_entry_id: null,
    pros: [],
    cons: [],
    archived_at: null,
    created_at: '',
    updated_at: '',
    parent_ids: [],
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled: false,
    ...overrides,
  };
}

const COLOSSEUM = makeEntry({ id: 1, title: 'Colosseum', lat: 41.9, lng: 12.5 });
const TRATTORIA = makeEntry({ id: 2, title: 'Trattoria da Enzo', lat: 41.88, lng: 12.47 });

function ungrouped(entries: Entry[]): EntryGroup[] {
  return entries.length > 0 ? [{ key: 'all', label: '', entries }] : [];
}

function renderList(overrides: Partial<MapIdeaListProps> = {}) {
  const props: MapIdeaListProps = {
    groups: ungrouped([COLOSSEUM, TRATTORIA]),
    metaLines: new Map(),
    selectedIds: [],
    onToggleSelect: () => {},
    onRowNameClick: () => {},
    onZoomGroup: () => {},
    justAddedId: null,
    placeless: [],
    onPutOnMap: () => {},
    canEdit: true,
    ...overrides,
  };
  render(<MapIdeaList {...props} />);
}

describe('MapIdeaList — rows', () => {
  it('renders a row per entry, the name as a button that centres the map', async () => {
    const user = userEvent.setup();
    const onRowNameClick = vi.fn();
    renderList({ onRowNameClick });

    await user.click(screen.getByRole('button', { name: 'Colosseum' }));

    expect(onRowNameClick).toHaveBeenCalledWith(1);
  });

  it('gives each row a checkbox named after the idea, and reports toggles', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    renderList({ onToggleSelect });

    await user.click(screen.getByRole('checkbox', { name: 'Trattoria da Enzo' }));

    expect(onToggleSelect).toHaveBeenCalledWith(2);
  });

  it('checks exactly the selected rows', () => {
    renderList({ selectedIds: [2] });
    expect(screen.getByRole('checkbox', { name: 'Colosseum' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('checkbox', { name: 'Trattoria da Enzo' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('offers a viewer no checkboxes at all — the names still work', () => {
    renderList({ canEdit: false });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Colosseum' })).toBeInTheDocument();
  });

  it('shows the meta line under a row only when it says something', () => {
    renderList({
      metaLines: new Map([
        [1, 'Piazza del Colosseo · in Rome'],
        [2, ''],
      ]),
    });
    expect(screen.getByText('Piazza del Colosseo · in Rome')).toBeInTheDocument();
    // The empty string draws no element — no blank line under the second row.
    const rows = document.querySelectorAll('p');
    expect(Array.from(rows).filter((p) => p.textContent === '')).toHaveLength(0);
  });

  it('marks a scheduled idea with the "on a day" tick and a non-zero tally with the votes pill', () => {
    renderList({
      groups: ungrouped([
        makeEntry({ id: 1, title: 'Colosseum', scheduled: true }),
        makeEntry({ id: 2, title: 'Trattoria', vote_tally: { total: 3, count: 2, average: 1.5 } }),
      ]),
    });
    expect(screen.getByText('✓ on a day')).toBeInTheDocument();
    expect(screen.getByText('▲ 3')).toBeInTheDocument();
  });

  it('draws neither pill when there is nothing to say', () => {
    renderList();
    expect(screen.queryByText('✓ on a day')).not.toBeInTheDocument();
    expect(screen.queryByText(/^▲/)).not.toBeInTheDocument();
  });

  it('labels only the just-added row', () => {
    renderList({ justAddedId: 2 });
    const labels = screen.getAllByText('just added');
    expect(labels).toHaveLength(1);
    expect(document.querySelector('[data-just-added]')).toHaveTextContent('Trattoria da Enzo');
  });

  it('renders nothing for the groups part when there are no groups', () => {
    renderList({ groups: [] });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('MapIdeaList — group headers', () => {
  const GROUPED: EntryGroup[] = [
    { key: 'place', label: 'Place', entries: [COLOSSEUM] },
    { key: 'food', label: 'Food', entries: [TRATTORIA] },
  ];

  it('heads each group with its label, count and a zoom action', async () => {
    const user = userEvent.setup();
    const onZoomGroup = vi.fn();
    renderList({ groups: GROUPED, onZoomGroup });

    expect(screen.getByText('Place')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zoom to Food' }));

    expect(onZoomGroup).toHaveBeenCalledWith('food');
  });

  it('shows how many ideas each group holds', () => {
    renderList({
      groups: [{ key: 'place', label: 'Place', entries: [COLOSSEUM, TRATTORIA] }],
    });
    const header = screen.getByText('Place').parentElement as HTMLElement;
    expect(within(header).getByText('2')).toBeInTheDocument();
  });

  it('draws no header at all for the single ungrouped section', () => {
    renderList();
    expect(screen.queryByRole('button', { name: /^Zoom to/ })).not.toBeInTheDocument();
  });
});

describe('MapIdeaList — the place-less footer', () => {
  const NO_PLACE = [
    makeEntry({ id: 10, title: 'Something local' }),
    makeEntry({ id: 11, title: 'That bakery' }),
  ];

  it('is absent while every idea has a place', () => {
    renderList();
    expect(screen.queryByText(/no place yet/)).not.toBeInTheDocument();
  });

  it('counts the place-less, in the singular when there is one', () => {
    renderList({ placeless: [NO_PLACE[0]] });
    expect(screen.getByText('1 idea has no place yet')).toBeInTheDocument();
  });

  it('counts the rest in the plural, and says why they are not on the map', () => {
    renderList({ placeless: NO_PLACE });
    expect(screen.getByText('2 ideas have no place yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Not hidden — they are on your board, they just cannot be drawn here. Give one a place and it joins the map.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the ideas folded until asked, then folds them back', async () => {
    const user = userEvent.setup();
    renderList({ placeless: NO_PLACE });

    expect(screen.queryByText('That bakery')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Show them ›' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(screen.getByText('That bakery')).toBeInTheDocument();
    expect(screen.getByText('Something local')).toBeInTheDocument();

    const hide = screen.getByRole('button', { name: 'Hide them' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    await user.click(hide);

    expect(screen.queryByText('That bakery')).not.toBeInTheDocument();
  });

  it('offers "Put it on the map" per idea, reporting which one', async () => {
    const user = userEvent.setup();
    const onPutOnMap = vi.fn();
    renderList({ placeless: NO_PLACE, onPutOnMap });

    await user.click(screen.getByRole('button', { name: 'Show them ›' }));
    const bakeryRow = screen.getByText('That bakery').parentElement as HTMLElement;
    await user.click(within(bakeryRow).getByRole('button', { name: 'Put it on the map' }));

    expect(onPutOnMap).toHaveBeenCalledWith(11);
  });

  it('lets a viewer see the list but not start placing', async () => {
    const user = userEvent.setup();
    renderList({ placeless: NO_PLACE, canEdit: false });

    await user.click(screen.getByRole('button', { name: 'Show them ›' }));

    expect(screen.getByText('That bakery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Put it on the map' })).not.toBeInTheDocument();
  });
});
