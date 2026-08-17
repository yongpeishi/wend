import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { TripRoleProvider } from '../../auth/TripRoleContext';
import { BulkBar } from './BulkBar';
import { api } from '../../api';
import type { Entry } from '../../api/types';

const TRIP_ID = 7;

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    kind: 'idea',
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

const TUESDAY = makeEntry({ id: 90, kind: 'bundle', title: 'Tuesday south' });
const TRAVEL_DAY = makeEntry({ id: 91, kind: 'bundle', title: 'Travel day' });

interface BarOptions {
  selectedIds?: number[];
  bundles?: Entry[];
  members?: Map<number, Entry[]>;
  tripId?: number;
  onClear?: () => void;
  onExitSelectMode?: () => void;
  onToast?: (message: string) => void;
}

function renderBar(options: BarOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BulkBar
          selectedIds={options.selectedIds ?? [1, 2]}
          bundles={options.bundles ?? [TUESDAY, TRAVEL_DAY]}
          members={options.members}
          tripId={options.tripId ?? TRIP_ID}
          onClear={options.onClear ?? (() => {})}
          onExitSelectMode={options.onExitSelectMode}
          onToast={options.onToast ?? (() => {})}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Opens the "Add to" popover and hands back the user-event session. */
async function openAddTo(options: BarOptions = {}) {
  const user = userEvent.setup();
  renderBar(options);
  await user.click(screen.getByRole('button', { name: 'Add to a bundle' }));
  return user;
}

describe('BulkBar — what it says about the selection', () => {
  it('is not on screen at all while nothing is picked', () => {
    renderBar({ selectedIds: [] });
    expect(screen.queryByRole('button', { name: 'Add to a bundle' })).not.toBeInTheDocument();
  });

  it('says "1 idea selected" rather than "1 ideas selected"', () => {
    renderBar({ selectedIds: [1] });
    expect(screen.getByText('1 idea selected')).toBeInTheDocument();
  });

  it('counts the rest in the plural', () => {
    renderBar({ selectedIds: [1, 2, 3] });
    expect(screen.getByText('3 ideas selected')).toBeInTheDocument();
  });

  // The mockup draws only "Add to a bundle". Removing two verbs that work would
  // be a regression, so they stay — quieter, not gone.
  it('keeps Lift out and Set aside beside the bundle verb', () => {
    renderBar();
    expect(screen.getByRole('button', { name: 'Lift out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set aside' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('drops the selection when Clear is chosen', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderBar({ onClear });

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onClear).toHaveBeenCalled();
  });
});

describe('BulkBar — the "Add to" popover', () => {
  it('stays shut until it is asked for', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: 'Tuesday south' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to a bundle' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('lists every bundle that exists, and ends with a way to start another', async () => {
    await openAddTo();

    expect(screen.getByText('Add to')).toBeInTheDocument();
    const rows = screen.getAllByRole('button').map((button) => button.textContent);
    expect(rows).toContain('Tuesday south');
    expect(rows).toContain('Travel day');
    expect(rows).toContain('A new bundle');
  });

  it('offers to start a bundle even when there is not one yet', async () => {
    await openAddTo({ bundles: [] });
    expect(screen.getByRole('button', { name: 'A new bundle' })).toBeInTheDocument();
  });

  it('closes on Escape and gives focus back to the button that opened it', async () => {
    const user = await openAddTo();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: 'Tuesday south' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to a bundle' })).toHaveFocus();
  });

  // The click-catcher is hidden from assistive tech on purpose — it is a
  // pointer convenience, and Escape is the keyboard's way out — so it has to be
  // reached by its markup rather than by role. jsdom lays nothing out, so
  // clicking the body would miss it.
  it('closes when the click lands anywhere else', async () => {
    const user = await openAddTo();
    const catcher = document.querySelector('button[aria-hidden="true"]');
    expect(catcher).not.toBeNull();

    await user.click(catcher as HTMLElement);

    expect(screen.queryByRole('button', { name: 'Tuesday south' })).not.toBeInTheDocument();
  });
});

describe('BulkBar — adding the selection to a bundle', () => {
  it('links every picked idea to the bundle chosen, then stands down entirely', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ link: {} });
    const onClear = vi.fn();
    const onExitSelectMode = vi.fn();
    const onToast = vi.fn();
    const user = await openAddTo({ selectedIds: [1, 2], onClear, onExitSelectMode, onToast });

    await user.click(screen.getByRole('button', { name: 'Tuesday south' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post).toHaveBeenCalledWith('/entries/90/links', { child_id: 1 });
    expect(post).toHaveBeenCalledWith('/entries/90/links', { child_id: 2 });
    expect(onClear).toHaveBeenCalled();
    expect(onExitSelectMode).toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('Added 2 ideas to Tuesday south.');
    post.mockRestore();
  });

  it('leaves alone an idea that is already in that bundle', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ link: {} });
    const members = new Map([[90, [makeEntry({ id: 1 })]]]);
    const user = await openAddTo({ selectedIds: [1, 2], members });

    await user.click(screen.getByRole('button', { name: 'Tuesday south' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/entries/90/links', { child_id: 2 });
    post.mockRestore();
  });
});

// The mockup creates a bundle called "New bundle" on the spot. A rail of
// bundles called "New bundle" is not a plan, so the last row asks for a name.
describe('BulkBar — starting a new bundle from the selection', () => {
  it('asks what the bundle is called instead of naming it for you', async () => {
    const user = await openAddTo();

    await user.click(screen.getByRole('button', { name: 'A new bundle' }));

    expect(screen.getByRole('dialog', { name: 'Start a bundle' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tuesday south' })).not.toBeInTheDocument();
  });

  it('creates the bundle under the trip, puts every picked idea in it, and leaves select mode', async () => {
    const created = makeEntry({ id: 99, kind: 'bundle', title: 'If it rains' });
    const post = vi
      .spyOn(api, 'post')
      .mockImplementation((path: string) =>
        Promise.resolve(path === '/entries' ? { entry: created } : { link: {} }),
      );
    const onClear = vi.fn();
    const onExitSelectMode = vi.fn();
    const onToast = vi.fn();
    const user = await openAddTo({ selectedIds: [1, 2], onClear, onExitSelectMode, onToast });

    await user.click(screen.getByRole('button', { name: 'A new bundle' }));
    await user.type(screen.getByLabelText('What are you calling it?'), 'If it rains');
    await user.click(screen.getByRole('button', { name: 'Start it' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/entries', {
        entry: { kind: 'bundle', title: 'If it rains' },
        parent_id: TRIP_ID,
      }),
    );
    await waitFor(() => expect(post).toHaveBeenCalledWith('/entries/99/links', { child_id: 2 }));
    expect(post).toHaveBeenCalledWith('/entries/99/links', { child_id: 1 });
    expect(onClear).toHaveBeenCalled();
    expect(onExitSelectMode).toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('Added 2 ideas to If it rains.');
    post.mockRestore();
  });

  it('will not start a bundle with no name', async () => {
    const user = await openAddTo();

    await user.click(screen.getByRole('button', { name: 'A new bundle' }));

    expect(screen.getByRole('button', { name: 'Start it' })).toBeDisabled();
  });
});

describe('BulkBar — reading along', () => {
  /**
   * Every verb on this bar changes the trip, so there is no read-only half of
   * it to leave behind. The list it acts on is elsewhere and untouched — this
   * component contributes no content of its own, which is why "nothing at all"
   * is the right answer here and nowhere else in the slice.
   */
  it('is not on screen at all for a viewer, even with ideas picked', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TripRoleProvider role="viewer">
            <BulkBar
              selectedIds={[1, 2]}
              bundles={[TUESDAY, TRAVEL_DAY]}
              tripId={TRIP_ID}
              onClear={() => {}}
              onToast={() => {}}
            />
          </TripRoleProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByText('2 ideas selected')).not.toBeInTheDocument();
    for (const label of ['Add to a bundle', 'Lift out', 'Set aside', 'Clear']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('is on screen as usual for a member', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TripRoleProvider role="member">
            <BulkBar
              selectedIds={[1, 2]}
              bundles={[TUESDAY, TRAVEL_DAY]}
              tripId={TRIP_ID}
              onClear={() => {}}
              onToast={() => {}}
            />
          </TripRoleProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Add to a bundle' })).toBeInTheDocument();
  });
});
