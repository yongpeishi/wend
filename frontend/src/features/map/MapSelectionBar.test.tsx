import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { api } from '../../api';
import type { Entry } from '../../api/types';
import { MapSelectionBar } from './MapSelectionBar';
import type { MapSelectionBarProps } from './MapSelectionBar';

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

const TUESDAY = makeEntry({ id: 90, kind: 'bundle', title: 'Tuesday south' });
const TRAVEL_DAY = makeEntry({ id: 91, kind: 'bundle', title: 'Travel day' });

function renderBar(overrides: Partial<MapSelectionBarProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props: MapSelectionBarProps = {
    selectedIds: [1, 2],
    bundles: [TUESDAY, TRAVEL_DAY],
    members: new Map(),
    tripId: TRIP_ID,
    firstSelectedTitle: 'Colosseum',
    canEdit: true,
    onClear: () => {},
    onToast: () => {},
    ...overrides,
  };
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MapSelectionBar {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Opens the "Add to plan" popover and hands back the user-event session. */
async function openAddTo(overrides: Partial<MapSelectionBarProps> = {}) {
  const user = userEvent.setup();
  renderBar(overrides);
  await user.click(screen.getByRole('button', { name: 'Add to plan' }));
  return user;
}

describe('MapSelectionBar — empty selection', () => {
  it('teaches the gesture in one sentence instead of showing empty chrome', () => {
    renderBar({ selectedIds: [] });
    expect(
      screen.getByText(
        'Tick ideas in the list or click their pins, then send them to a plan. Drag the map to look around.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to plan' })).not.toBeInTheDocument();
  });

  it('shows the same sentence to a viewer', () => {
    renderBar({ selectedIds: [], canEdit: false });
    expect(screen.getByText(/Tick ideas in the list/)).toBeInTheDocument();
  });
});

describe('MapSelectionBar — what it says about the selection', () => {
  it('says "1 idea selected" rather than "1 ideas selected"', () => {
    renderBar({ selectedIds: [1] });
    expect(screen.getByText('1 idea selected')).toBeInTheDocument();
  });

  it('counts the rest in the plural', () => {
    renderBar({ selectedIds: [1, 2, 3] });
    expect(screen.getByText('3 ideas selected')).toBeInTheDocument();
  });

  it('drops the selection when Clear is chosen', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderBar({ onClear });

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onClear).toHaveBeenCalled();
  });
});

describe('MapSelectionBar — the "Add to plan" popover', () => {
  it('stays shut until it is asked for', () => {
    renderBar();
    expect(screen.queryByText('Tuesday south')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to plan' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('lists every plan with how full it is, and ends with a way to start another', async () => {
    await openAddTo({
      members: new Map([
        [90, [makeEntry({ id: 5 })]],
        [91, []],
      ]),
    });

    const tuesday = screen.getByRole('button', { name: /Tuesday south/ });
    expect(within(tuesday).getByText('1 idea')).toBeInTheDocument();
    const travelDay = screen.getByRole('button', { name: /Travel day/ });
    expect(within(travelDay).getByText('0 ideas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New plan from these' })).toBeInTheDocument();
  });

  it('closes on Escape and gives focus back to the button that opened it', async () => {
    const user = await openAddTo();

    await user.keyboard('{Escape}');

    expect(screen.queryByText('Tuesday south')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to plan' })).toHaveFocus();
  });

  // The click-catcher is hidden from assistive tech on purpose — it is a
  // pointer convenience, and Escape is the keyboard's way out — so it has to
  // be reached by its markup rather than by role.
  it('closes when the click lands anywhere else', async () => {
    const user = await openAddTo();
    const catcher = document.querySelector('button[aria-hidden="true"]');
    expect(catcher).not.toBeNull();

    await user.click(catcher as HTMLElement);

    expect(screen.queryByText('Tuesday south')).not.toBeInTheDocument();
  });
});

describe('MapSelectionBar — adding the selection to a plan', () => {
  it('links every picked idea, then clears, closes and says what happened — in that order', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ link: {} });
    const calls: string[] = [];
    const onClear = vi.fn(() => calls.push('clear'));
    const onToast = vi.fn(() => calls.push('toast'));
    const user = await openAddTo({ selectedIds: [1, 2], onClear, onToast });

    await user.click(screen.getByRole('button', { name: /Tuesday south/ }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post).toHaveBeenCalledWith('/entries/90/links', { child_id: 1 });
    expect(post).toHaveBeenCalledWith('/entries/90/links', { child_id: 2 });
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Added 2 ideas to Tuesday south. Still on your board too.'),
    );
    expect(calls).toEqual(['clear', 'toast']);
    expect(screen.queryByRole('button', { name: /Tuesday south/ })).not.toBeInTheDocument();
    post.mockRestore();
  });

  it('leaves alone an idea that is already in that plan, but still counts it in the toast', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ link: {} });
    const onToast = vi.fn();
    const members = new Map([[90, [makeEntry({ id: 1 })]]]);
    const user = await openAddTo({ selectedIds: [1, 2], members, onToast });

    await user.click(screen.getByRole('button', { name: /Tuesday south/ }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/entries/90/links', { child_id: 2 });
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Added 2 ideas to Tuesday south. Still on your board too.'),
    );
    post.mockRestore();
  });

  it('answers a failed save with the house error toast, not the success callback', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('nope'));
    const onClear = vi.fn();
    const onToast = vi.fn();
    const user = await openAddTo({ selectedIds: [1], onClear, onToast });

    await user.click(screen.getByRole('button', { name: /Tuesday south/ }));

    expect(
      await screen.findByText("That didn't save. It's still here — try again."),
    ).toBeInTheDocument();
    expect(onToast).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    post.mockRestore();
  });
});

describe('MapSelectionBar — starting a new plan from the selection', () => {
  it('asks what the plan is called, with nothing prefilled', async () => {
    const user = await openAddTo();

    await user.click(screen.getByRole('button', { name: 'New plan from these' }));

    expect(screen.getByRole('dialog', { name: 'Start a plan' })).toBeInTheDocument();
    // Deliberately NOT seeded from firstSelectedTitle — naming is the point.
    expect(screen.getByLabelText('What are you calling it?')).toHaveValue('');
    expect(screen.queryByRole('button', { name: /Tuesday south/ })).not.toBeInTheDocument();
  });

  it('creates the plan under the trip, puts every picked idea in it, and stands down', async () => {
    const created = makeEntry({ id: 99, kind: 'bundle', title: 'If it rains' });
    const post = vi
      .spyOn(api, 'post')
      .mockImplementation((path: string) =>
        Promise.resolve(path === '/entries' ? { entry: created } : { link: {} }),
      );
    const onClear = vi.fn();
    const onToast = vi.fn();
    const user = await openAddTo({ selectedIds: [1, 2], onClear, onToast });

    await user.click(screen.getByRole('button', { name: 'New plan from these' }));
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
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Added 2 ideas to If it rains. Still on your board too.'),
    );
    post.mockRestore();
  });
});

describe('MapSelectionBar — reading along', () => {
  // Defensive: the parent never offers selection to viewers, but a selection
  // that somehow arrives is still theirs to put down.
  it('gives a viewer with a selection only the count and Clear', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderBar({ canEdit: false, onClear });

    expect(screen.getByText('2 ideas selected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to plan' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalled();
  });
});
