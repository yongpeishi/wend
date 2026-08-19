import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../../api';
import type { Entry } from '../../api/types';
import { StructurePanel } from './StructurePanel';

/**
 * Runs against the MSW handlers' seeded db through the ONE GET /entries/1/graph
 * call the panel makes. Seeded trip 1: Nanzen-ji plus two bundles hang off the
 * trip, and each bundle holds three members — so the default two-open-levels
 * posture shows the whole seed. Tests that need depth, duplication or archiving
 * write those links first through the same API the app uses.
 */

const TRIP_ID = 1;
const NANZENJI_ID = 2;
const KIYAMACHI_ID = 3;
const MARKET_BUNDLE_ID = 4;
const FUSHIMI_ID = 5;
const COFFEE_ID = 6;

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    kind: 'trip',
    title: 'Untitled',
    description: null,
    category: null,
    starts_on: null,
    ends_on: null,
    location_name: null,
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
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled: false,
    ...overrides,
  };
}

function renderPanel(onOpenEntry: (id: number) => void = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StructurePanel
        trip={makeEntry({ id: TRIP_ID, kind: 'trip', title: 'Six days in Kyoto' })}
        onOpenEntry={onOpenEntry}
      />
    </QueryClientProvider>,
  );
}

/** The row strip a title button sits in — where its dot, badge and chips are. */
function rowOf(title: string): HTMLElement {
  return screen.getByRole('button', { name: title }).parentElement as HTMLElement;
}

describe('StructurePanel — the tree', () => {
  it('renders the whole subtree as a labelled tree, two levels open by default', async () => {
    renderPanel();

    // The root, its children, and — because the children start open too — each
    // bundle's members are all on screen without a single click.
    expect(await screen.findByText('Six days in Kyoto')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Trip structure' })).toBeInTheDocument();
    expect(screen.getByText('Nanzen-ji')).toBeInTheDocument();
    expect(screen.getByText('Nishiki market crawl')).toBeInTheDocument();
    expect(screen.getByText('A night out in Pontocho')).toBeInTheDocument();
    expect(screen.getByText('Coffee at Weekenders')).toBeInTheDocument();
    expect(screen.getByText('Kiyamachi')).toBeInTheDocument();
  });

  it('starts anything deeper than two levels folded, one click away', async () => {
    // A third level: the library idea now hangs under the coffee stop.
    await api.post(`/entries/${COFFEE_ID}/links`, { child_id: FUSHIMI_ID });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Coffee at Weekenders');

    expect(screen.queryByText('Fushimi Inari at dawn')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand Coffee at Weekenders' }));

    expect(screen.getByText('Fushimi Inari at dawn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse Coffee at Weekenders' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('collapses and reopens a branch from its chevron', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Nishiki market crawl');
    expect(screen.getByText('Teramachi arcade')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse Nishiki market crawl' }));

    expect(screen.queryByText('Teramachi arcade')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Nishiki market crawl' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Expand Nishiki market crawl' }));

    expect(screen.getByText('Teramachi arcade')).toBeInTheDocument();
  });

  it('gives a leaf no chevron at all', async () => {
    renderPanel();
    await screen.findByText('Coffee at Weekenders');

    expect(screen.queryByRole('button', { name: 'Expand Coffee at Weekenders' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse Coffee at Weekenders' })).not.toBeInTheDocument();
  });
});

describe('StructurePanel — what a row says', () => {
  it('badges bundles, and only bundles', async () => {
    renderPanel();
    await screen.findByText('Nishiki market crawl');

    expect(within(rowOf('Nishiki market crawl')).getByText('Bundle')).toBeInTheDocument();
    expect(within(rowOf('A night out in Pontocho')).getByText('Bundle')).toBeInTheDocument();
    expect(within(rowOf('Nanzen-ji')).queryByText('Bundle')).not.toBeInTheDocument();
  });

  it('marks a scheduled entry with the dot, in words too', async () => {
    renderPanel();
    await screen.findByText('Nanzen-ji');

    // Nanzen-ji is placed in a live version; Kiyamachi is the seed's unplaced idea.
    expect(within(rowOf('Nanzen-ji')).getByText('On the schedule:')).toBeInTheDocument();
    expect(within(rowOf('Kiyamachi')).queryByText('On the schedule:')).not.toBeInTheDocument();
  });

  it('carries a compact vote tally where anyone has voted', async () => {
    renderPanel();
    await screen.findByText('Nanzen-ji');

    // Seeded votes: +2 and -1 on Nanzen-ji, +1 on Kiyamachi, none on the coffee.
    expect(within(rowOf('Nanzen-ji')).getByText('+1')).toBeInTheDocument();
    expect(within(rowOf('Kiyamachi')).getByText('+1')).toBeInTheDocument();
    expect(within(rowOf('Coffee at Weekenders')).queryByText(/^[+-]?\d+$/)).not.toBeInTheDocument();
  });
});

describe('StructurePanel — a child in several places', () => {
  it('renders once under each parent, each occurrence naming the other home', async () => {
    // Kiyamachi joins the market bundle as well as the night bundle.
    await api.post(`/entries/${MARKET_BUNDLE_ID}/links`, { child_id: KIYAMACHI_ID });
    renderPanel();
    await screen.findByText('Nishiki market crawl');

    expect(screen.getAllByRole('button', { name: 'Kiyamachi' })).toHaveLength(2);
    expect(screen.getByText('also under A night out in Pontocho')).toBeInTheDocument();
    expect(screen.getByText('also under Nishiki market crawl')).toBeInTheDocument();
  });

  it('collapses the chip to a count past two parents', async () => {
    await api.post(`/entries/${MARKET_BUNDLE_ID}/links`, { child_id: KIYAMACHI_ID });
    await api.post(`/entries/${TRIP_ID}/links`, { child_id: KIYAMACHI_ID });
    renderPanel();
    await screen.findByText('Nishiki market crawl');

    expect(screen.getAllByRole('button', { name: 'Kiyamachi' })).toHaveLength(3);
    expect(screen.getAllByText('in 3 places')).toHaveLength(3);
    expect(screen.queryByText(/also under/)).not.toBeInTheDocument();
  });
});

describe('StructurePanel — set aside stays out', () => {
  it('drops an archived entry and its whole subtree', async () => {
    await api.delete(`/entries/${MARKET_BUNDLE_ID}`);
    renderPanel();
    await screen.findByText('Nanzen-ji');

    expect(screen.queryByText('Nishiki market crawl')).not.toBeInTheDocument();
    // Its members only lived under it, so they go with it.
    expect(screen.queryByText('Coffee at Weekenders')).not.toBeInTheDocument();
    expect(screen.queryByText('Nishiki market')).not.toBeInTheDocument();
    // The rest of the trip is untouched.
    expect(screen.getByText('A night out in Pontocho')).toBeInTheDocument();
  });
});

describe('StructurePanel — opening an entry', () => {
  it('a title click opens the entry; a chevron click only discloses', async () => {
    const onOpenEntry = vi.fn();
    const user = userEvent.setup();
    renderPanel(onOpenEntry);
    await screen.findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: 'Collapse Nishiki market crawl' }));
    expect(onOpenEntry).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Nanzen-ji' }));
    expect(onOpenEntry).toHaveBeenCalledWith(NANZENJI_ID);
  });
});
