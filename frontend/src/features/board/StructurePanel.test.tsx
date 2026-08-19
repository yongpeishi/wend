import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { api } from '../../api';
import type { Entry, ScheduleItem, TripRole } from '../../api/types';
import { ToastProvider } from '../../components/Toast';
import { TripRoleProvider } from '../../auth/TripRoleContext';
import { server } from '../../mocks/server';
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

/**
 * No provider = the editable default, same as every board test. `role` mounts
 * the real TripRoleProvider for the viewer cases. The ToastProvider is here
 * because the row menus report through it; the panel itself never toasts.
 * The trip carries its seeded starts_on because "Send to schedule" lands
 * things on the trip's first day.
 */
function renderPanel(onOpenEntry: (id: number) => void = () => {}, role?: TripRole) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const panel = (
    <StructurePanel
      trip={makeEntry({ id: TRIP_ID, kind: 'trip', title: 'Six days in Kyoto', starts_on: '2026-11-02' })}
      onOpenEntry={onOpenEntry}
    />
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{role ? <TripRoleProvider role={role}>{panel}</TripRoleProvider> : panel}</ToastProvider>
    </QueryClientProvider>,
  );
}

/** The title line a title button sits in — where its dot, badge and score are.
 * (The "also under" report lives on its own line below, queried at screen level.) */
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

/** Open a row's ⋯ and hand back the popup, scoped — chip and nudge names
 * repeat titles that are also tree rows, so every query goes through this. */
async function openRowMenu(user: ReturnType<typeof userEvent.setup>, title: string): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: `Structure actions for ${title}` }));
  return screen.getByRole('group', { name: `Structure actions for ${title}` });
}

describe('StructurePanel — who gets the verbs', () => {
  it('gives an editor a grip and a ⋯ on every row but the root', async () => {
    renderPanel();
    await screen.findByText('Nanzen-ji');

    expect(screen.getByRole('button', { name: 'Move Nanzen-ji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Structure actions for Nanzen-ji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Coffee at Weekenders' })).toBeInTheDocument();

    // The root is the frame, not a thing to move or re-file.
    expect(screen.queryByRole('button', { name: 'Move Six days in Kyoto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Structure actions for Six days in Kyoto' })).not.toBeInTheDocument();
  });

  it('a viewer keeps the whole reading and loses every verb', async () => {
    renderPanel(undefined, 'viewer');
    await screen.findByText('Nanzen-ji');

    // The slice-3 panel, exactly: every row still says its piece...
    expect(screen.getByText('Coffee at Weekenders')).toBeInTheDocument();
    expect(screen.getByText('A night out in Pontocho')).toBeInTheDocument();
    // ...and nothing on it edits — no grips, no menus, anywhere.
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Structure actions for / })).not.toBeInTheDocument();
  });
});

describe('StructureRowMenu — Add to another parent', () => {
  it('offers the root, bundles and ideas — never itself or its own subtree — and ticks current parents', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Nishiki market crawl');

    const menu = await openRowMenu(user, 'Nishiki market crawl');
    await user.click(within(menu).getByRole('button', { name: 'Add to another parent…' }));

    // Already under the trip: shown, and shown checked.
    expect(within(menu).getByRole('button', { name: 'Six days in Kyoto' })).toHaveAttribute('aria-pressed', 'true');
    // The other bundle and a loose idea: fair candidates, unchecked.
    expect(within(menu).getByRole('button', { name: 'A night out in Pontocho' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(menu).getByRole('button', { name: 'Nanzen-ji' })).toHaveAttribute('aria-pressed', 'false');
    // Itself and its own members — the cycle-obvious cases — are not offered.
    expect(within(menu).queryByRole('button', { name: 'Nishiki market crawl' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Coffee at Weekenders' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Teramachi arcade' })).not.toBeInTheDocument();
  });

  it('checking a chip links the entry there — the copy path, old homes untouched', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Kiyamachi');

    const menu = await openRowMenu(user, 'Kiyamachi');
    await user.click(within(menu).getByRole('button', { name: 'Add to another parent…' }));
    await user.click(within(menu).getByRole('button', { name: 'Nishiki market crawl' }));

    expect(await screen.findByText('Added to Nishiki market crawl.')).toBeInTheDocument();
    // Both homes now — the old link was never touched.
    const bundle = await api.get<{ children: { id: number }[] }>(`/entries/${MARKET_BUNDLE_ID}`);
    expect(bundle.children.map((child) => child.id)).toContain(KIYAMACHI_ID);
    expect(await screen.findAllByRole('button', { name: 'Kiyamachi' })).toHaveLength(2);
  });

  it('unchecking a current parent removes that one link', async () => {
    // A second home first, so unchecking leaves the entry somewhere.
    await api.post(`/entries/${MARKET_BUNDLE_ID}/links`, { child_id: KIYAMACHI_ID });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Nishiki market crawl');

    const [trigger] = screen.getAllByRole('button', { name: 'Structure actions for Kiyamachi' });
    await user.click(trigger);
    const [menu] = screen.getAllByRole('group', { name: 'Structure actions for Kiyamachi' });
    await user.click(within(menu).getByRole('button', { name: 'Add to another parent…' }));
    await user.click(within(menu).getByRole('button', { name: 'A night out in Pontocho' }));

    expect(await screen.findByText('Removed from A night out in Pontocho. Still kept.')).toBeInTheDocument();
  });

  it('a cycle refusal surfaces the server’s own sentence, not the generic line', async () => {
    const refusal = 'would create a cycle: Kiyamachi → A night out in Pontocho → Kiyamachi';
    server.use(
      http.post('/api/entries/:id/links', () => HttpResponse.json({ errors: { base: [refusal] } }, { status: 422 })),
    );
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Kiyamachi');

    const menu = await openRowMenu(user, 'Kiyamachi');
    await user.click(within(menu).getByRole('button', { name: 'Add to another parent…' }));
    await user.click(within(menu).getByRole('button', { name: 'Nanzen-ji' }));

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(screen.queryByText(/That didn't save/)).not.toBeInTheDocument();
  });
});

describe('StructureRowMenu — Send to schedule', () => {
  /** Everything the panel schedules lands on the trip's first day; the
   * itinerary is where it gets moved. This reads the final-schedule endpoint
   * and answers "is (entry, first day) on it, how many times?" */
  async function itemsOnFirstDay(entryId: number): Promise<ScheduleItem[]> {
    const { schedule_items } = await api.get<{ schedule_items: ScheduleItem[] }>(`/trips/${TRIP_ID}/schedule`);
    return schedule_items.filter((item) => item.entry_id === entryId && item.day === '2026-11-02');
  }

  it('nudges before scheduling an idea that holds options, naming each of them', async () => {
    await api.post(`/entries/${NANZENJI_ID}/links`, { child_id: FUSHIMI_ID });
    await api.post(`/entries/${NANZENJI_ID}/links`, { child_id: KIYAMACHI_ID });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Nanzen-ji');

    const menu = await openRowMenu(user, 'Nanzen-ji');
    await user.click(within(menu).getByRole('button', { name: 'Send to schedule' }));

    expect(within(menu).getByText('This holds 2 options — schedule a specific one?')).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Fushimi Inari at dawn' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Kiyamachi' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Schedule “Nanzen-ji” anyway' })).toBeInTheDocument();
    // Asking is not doing: nothing has been scheduled yet.
    expect(screen.queryByText(/to the schedule\./)).not.toBeInTheDocument();
  });

  it('picking an option schedules THAT child, on the trip’s first day', async () => {
    await api.post(`/entries/${NANZENJI_ID}/links`, { child_id: FUSHIMI_ID });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Nanzen-ji');

    const menu = await openRowMenu(user, 'Nanzen-ji');
    await user.click(within(menu).getByRole('button', { name: 'Send to schedule' }));
    await user.click(within(menu).getByRole('button', { name: 'Fushimi Inari at dawn' }));

    expect(await screen.findByText('Added Fushimi Inari at dawn to the schedule.')).toBeInTheDocument();
    expect(await itemsOnFirstDay(FUSHIMI_ID)).toHaveLength(1);
    // The parent — the question — was not scheduled behind the answer's back.
    expect(await itemsOnFirstDay(NANZENJI_ID)).toHaveLength(1); // the seeded 09:00 visit only
  });

  it('“anyway” schedules the parent itself', async () => {
    await api.post(`/entries/${KIYAMACHI_ID}/links`, { child_id: COFFEE_ID });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Kiyamachi');

    const menu = await openRowMenu(user, 'Kiyamachi');
    await user.click(within(menu).getByRole('button', { name: 'Send to schedule' }));
    expect(within(menu).getByText('This holds 1 option — schedule a specific one?')).toBeInTheDocument();
    await user.click(within(menu).getByRole('button', { name: 'Schedule “Kiyamachi” anyway' }));

    expect(await screen.findByText('Added Kiyamachi to the schedule.')).toBeInTheDocument();
    expect(await itemsOnFirstDay(KIYAMACHI_ID)).toHaveLength(1);
  });

  it('a bundle schedules whole, no questions asked — deferring the choice is the design', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Nishiki market crawl');

    const menu = await openRowMenu(user, 'Nishiki market crawl');
    await user.click(within(menu).getByRole('button', { name: 'Send to schedule' }));

    expect(screen.queryByText(/schedule a specific one/)).not.toBeInTheDocument();
    expect(await screen.findByText('Added Nishiki market crawl to the schedule.')).toBeInTheDocument();
    // Alongside the seeded 11:00 slot — this really was a second schedule item.
    await waitFor(async () => expect(await itemsOnFirstDay(MARKET_BUNDLE_ID)).toHaveLength(2));
  });

  it('a leaf idea schedules directly, no nudge', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Kiyamachi');

    const menu = await openRowMenu(user, 'Kiyamachi');
    await user.click(within(menu).getByRole('button', { name: 'Send to schedule' }));

    expect(screen.queryByText(/schedule a specific one/)).not.toBeInTheDocument();
    expect(await screen.findByText('Added Kiyamachi to the schedule.')).toBeInTheDocument();
  });
});
