import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { server } from '../mocks/server';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { setRole } from '../mocks/db';
import { TripBoard } from './TripBoard';
import styles from './TripBoard.module.css';
import rowStyles from '../features/board/IdeaRow.module.css';
import type { Entry, TripRole } from '../api/types';
import type { MapViewProps } from '../features/map/MapView';

/**
 * The shared fixture grew with the itinerary work — seven ideas across two
 * populated bundles — so every render in this file paints several times the
 * DOM it once did, and the map cases string half a dozen user events on top of
 * that. The 5s default is no longer comfortable here on a loaded machine;
 * nothing about these tests is meant to be a performance assertion.
 */
vi.setConfig({ testTimeout: 15_000 });

/**
 * jsdom has no layout engine, so a real Leaflet map cannot be mounted here (see
 * MapView.tsx's own doc comment) — the seam is mocked to a stub that exposes
 * every prop this route wires up: the pins with the mark BoardMapPane decided
 * for them (chip = in the list you are reading, dot = located but elsewhere),
 * the fit nonce, and buttons that fire the callbacks a pan / a pin / a cluster
 * would fire. The wiring under test is the board's, not Leaflet's.
 *
 * The stub deliberately does NOT report bounds on mount, the way the real map
 * does — "the map is open but has not said where it is looking yet" stays a
 * state these tests pass through.
 */
vi.mock('../features/map/MapView', () => ({
  MapView: (props: MapViewProps) => (
    <div data-testid="map-view">
      <p data-testid="fit-request">fit: {String(props.fitRequest)}</p>
      <p data-testid="pin-selected">selected: {String(props.selectedId)}</p>
      <ul>
        {props.pins.map((pin) => (
          <li key={pin.id}>
            <button type="button" onClick={() => props.onSelectPin?.(pin.id)}>
              {pin.title} ({pin.mark ?? 'unmarked'})
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => props.onBoundsChange?.({ north: 35.02, south: 35.01, east: 135.78, west: 135.76 })}
      >
        Simulate pan to Nanzen-ji only
      </button>
      <button type="button" onClick={() => props.onSelectCluster?.(props.pins.map((pin) => pin.id))}>
        Simulate cluster click
      </button>
    </div>
  ),
}));

/**
 * The capture bar and the composer are slice B2's components; the board only
 * promises to WIRE them — placeholder, parents, the create and the links — so
 * they are stubbed here at exactly the agreed interface. The stubs surface
 * every prop as text or as a control, which keeps these tests about the
 * board's side of the contract and immune to B2's markup.
 */
vi.mock('../features/board/CaptureBar', async () => {
  const { useState } = await import('react');
  function CaptureBar({
    placeholder,
    onQuickAdd,
    onOpenComposer,
  }: {
    placeholder: string;
    onQuickAdd: (title: string) => void;
    onOpenComposer: (draft: string) => void;
  }) {
    const [value, setValue] = useState('');
    return (
      <div data-testid="capture-bar">
        <input
          aria-label="Capture an idea"
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="button" onClick={() => onQuickAdd(value)}>
          Quick add
        </button>
        <button type="button" onClick={() => onOpenComposer(value)}>
          Open composer
        </button>
      </div>
    );
  }
  return { CaptureBar };
});

/**
 * One stub for BOTH instances of the composer: the top-of-list card the board
 * renders itself, and the inline one a row renders inside its own card when
 * the board names it as the host. They are the same component, so they are the
 * same mock — told apart here by `hostTitle`, exactly the way the real one
 * tells itself apart, and given different test ids so a test can assert which
 * of the two is standing (there is only ever one).
 */
vi.mock('../features/board/IdeaComposer', () => ({
  IdeaComposer: (props: {
    open: boolean;
    initialTitle: string;
    initialParentIds: number[];
    parentChoices: Entry[];
    allIdeas?: Entry[];
    hostTitle?: string;
    trimmed?: boolean;
    submitLabel?: string;
    onSubmit: (draft: {
      title: string;
      description: string;
      address: string;
      category: 'place' | 'food' | 'activity' | 'lodging' | 'transport' | 'other' | null;
      parentIds: number[];
    }) => void;
    onCancel: () => void;
  }) =>
    props.open ? (
      <div data-testid={props.hostTitle === undefined ? 'composer' : 'inline-composer'}>
        <p>composer title: {props.initialTitle}</p>
        <p>composer parents: {props.initialParentIds.join(',') || 'none'}</p>
        <p>composer choices: {props.parentChoices.length}</p>
        <p>composer host: {props.hostTitle ?? 'none'}</p>
        <p>composer ancestors: {props.allIdeas?.length ?? 'none'}</p>
        {/* Ids 2 and 3 are Nanzen-ji and Kiyamachi in the seed — a multi-parent
            draft, submitted at the contract level. */}
        <button
          type="button"
          onClick={() =>
            props.onSubmit({
              title: 'Composed idea',
              description: 'Lives in two places',
              address: '',
              category: 'food',
              parentIds: [2, 3],
            })
          }
        >
          Submit with two parents
        </button>
        {/* The ordinary commit: the chips exactly as they were seeded, and no
            category, which is what the composer now opens with. */}
        <button
          type="button"
          onClick={() =>
            props.onSubmit({
              title: 'Nested idea',
              description: '',
              address: '',
              category: null,
              parentIds: props.initialParentIds,
            })
          }
        >
          Submit as seeded
        </button>
        {/* Every Inside chip taken off before committing — a legitimate ask,
            and the top-level path. */}
        <button
          type="button"
          onClick={() =>
            props.onSubmit({
              title: 'Loose idea',
              description: '',
              address: '',
              category: null,
              parentIds: [],
            })
          }
        >
          Submit with no parents
        </button>
        {/* The host chip swapped for a different one before committing: the
            chips are the parent set, so the idea goes there and not here. */}
        <button
          type="button"
          onClick={() =>
            props.onSubmit({
              title: 'Refiled idea',
              description: '',
              address: '',
              category: null,
              parentIds: [3],
            })
          }
        >
          Submit filed elsewhere
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel composer
        </button>
      </div>
    ) : null,
}));

// The board reads `trip` from useOutletContext, which only exists inside an
// <Outlet> — routed through a stand-in layout, the same shape TripLayout gives.
function TestTripLayout() {
  return <Outlet context={{ trip: { id: 1, title: 'Six days in Kyoto' } }} />;
}

/**
 * `role` mounts the provider TripLayout mounts in the app. Omitted, there is no
 * provider at all and the context hands back its editable default. `url` is
 * how a test starts drilled: the path lives in the search params, so arriving
 * scoped is the same thing as following a shared link.
 */
function renderBoard({ role, url = '/trips/1' }: { role?: TripRole; url?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const board = (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/trips/:id" element={<TestTripLayout />}>
          <Route index element={<TripBoard />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {role ? <TripRoleProvider role={role}>{board}</TripRoleProvider> : board}
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/**
 * Seeded trip 1 (src/mocks/db.ts) holds SEVEN ideas, none of them nested under
 * another idea — their parents are the trip entry and the two bundles, which
 * the tree functions deliberately ignore — so the board's root level is all
 * seven. Only two are located: Nanzen-ji (35.0116/135.7681) and Kiyamachi
 * (35.0086/135.7717). The simulated pan above is a box around Nanzen-ji alone.
 */
const TRIP_ID = 1;
const NANZENJI_ID = 2;
const KIYAMACHI_ID = 3;
const MARKET_BUNDLE_ID = 4;
const MARKET_BUNDLE_TITLE = 'Nishiki market crawl';

/**
 * Pin buttons carry their mark in the label, so a pin is matched by prefix
 * wherever the mark is not what is under test. The mock database's `seed()`
 * re-seeds entries and links, but what a previous test created can still shift
 * a mark from a distance — matching on the title alone keeps every test that
 * is not about marks independent of what ran before it.
 */
function pin(title: string): RegExp {
  return new RegExp(`^${title} \\(`);
}

async function addIdea(entry: Record<string, unknown>, parentId: number = TRIP_ID) {
  await api.post('/entries', { entry: { kind: 'idea', ...entry }, parent_id: parentId });
}

/**
 * The ideas column on its own. The plans rail on the right lists each plan's
 * members by title, and six of this trip's seven ideas are in a bundle — so an
 * unscoped `getByText('Kiyamachi')` matches twice. Anything asking "is this
 * idea in the list?" has to ask it of this element.
 */
function ideas(): HTMLElement {
  return screen.getByRole('region', { name: 'Ideas' });
}

/** Raise the map — every map assertion starts here. The board now paints with
 * the pane DOWN, so this presses the "Show map" chip and waits for it, and is a
 * no-op for a caller that already has it up. */
async function mapUp() {
  const chip = screen.queryByRole('button', { name: 'Show map' });
  if (chip) await userEvent.setup().click(chip);
  return screen.findByTestId('map-view');
}

describe('TripBoard — showing and hiding the map', () => {
  // The default the board opens on. The ideas are the subject of this screen
  // and the map is the companion, so arriving no longer costs a scroll past a
  // pane nobody asked for. The follow switch is gone for good: the list takes
  // no cue from the viewport, so there is nothing for a switch to govern.
  it('paints with the map down, and without any follow switch', async () => {
    renderBoard();
    await screen.findByText('Nanzen-ji');

    expect(screen.queryByTestId('map-view')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show map' })).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    // While the map is down there is no pane header to hide it from.
    expect(screen.queryByRole('button', { name: 'Hide map' })).not.toBeInTheDocument();
  });

  it('comes up via the chip, goes back down via the pane', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: 'Show map' }));

    expect(await screen.findByTestId('map-view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide map' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show map' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide map' }));

    expect(screen.queryByTestId('map-view')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show map' })).toBeInTheDocument();
  });
});

describe('TripBoard — the map is a companion, never a filter', () => {
  // The old follow-the-map behaviour, asserted gone from the other side:
  // however the map is panned, the list holds every idea of the level.
  it('panning the map never cuts the list', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));

    // Kiyamachi is outside the simulated box, and stays on the list anyway.
    expect(within(ideas()).getByText('Kiyamachi')).toBeInTheDocument();
    expect(screen.getByText(/Showing 7 of 7/)).toBeInTheDocument();
    expect(screen.queryByText(/ideas in view/)).not.toBeInTheDocument();
  });

  it('still offers "Widen" once pins sit outside the view, and it re-fits the map', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    // Nothing off-screen yet, so nothing to widen back to.
    expect(screen.queryByRole('button', { name: 'Widen' })).not.toBeInTheDocument();

    // The pan puts Kiyamachi outside the box, so the way back appears — it
    // moves the MAP, not the list, which no longer listens.
    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));

    expect(await screen.findByRole('button', { name: 'Widen' })).toBeInTheDocument();
    expect(screen.getByTestId('fit-request')).toHaveTextContent('fit: 0');
    await user.click(screen.getByRole('button', { name: 'Widen' }));
    expect(screen.getByTestId('fit-request')).toHaveTextContent('fit: 1');
  });

  it('marks the pins of the list on screen as chips and the rest as dots', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    // At root both located ideas are in the visible list, so both are chips.
    expect(screen.getByRole('button', { name: 'Nanzen-ji (chip)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiyamachi (chip)' })).toBeInTheDocument();

    // Narrow the list by search: Kiyamachi leaves the LIST, but its pin stays
    // on the map — demoted to a dot, not deleted.
    await user.type(screen.getByRole('searchbox', { name: 'Search ideas' }), 'nanzen');

    expect(await screen.findByRole('button', { name: 'Kiyamachi (dot)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nanzen-ji (chip)' })).toBeInTheDocument();
    expect(within(ideas()).queryByText('Kiyamachi')).not.toBeInTheDocument();
  });

  it('keeps pinning ideas the drill has scoped away — dots, not absences', async () => {
    // A located child under Nanzen-ji: drilled into Kiyamachi's level it is
    // nowhere near the list, but it is still somewhere on the trip.
    await addIdea({ title: 'Temple garden', lat: 35.015, lng: 135.77 }, NANZENJI_ID);
    renderBoard({ url: `/trips/1?path=${NANZENJI_ID}` });
    await within(ideas()).findByText('Temple garden');
    await mapUp();

    // The drilled list holds only the child, so only its pin is a chip.
    expect(screen.getByRole('button', { name: 'Temple garden (chip)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nanzen-ji (dot)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiyamachi (dot)' })).toBeInTheDocument();
  });
});

describe('TripBoard — drilling down', () => {
  it('shows one level at a time, scoped by the path param', async () => {
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    renderBoard({ url: `/trips/1?path=${NANZENJI_ID}` });

    // The drilled level holds the child and nothing else.
    expect(await within(ideas()).findByText('Temple garden')).toBeInTheDocument();
    expect(within(ideas()).queryByText('Kiyamachi')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 1/)).toBeInTheDocument();
  });

  it('keeps a nested idea out of the root level', async () => {
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    expect(within(ideas()).queryByText('Temple garden')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 7 of 7/)).toBeInTheDocument();
  });

  it('draws the current idea first, then the way back and its own facts, on the breadcrumb', async () => {
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    renderBoard({ url: `/trips/1?path=${NANZENJI_ID}` });
    await within(ideas()).findByText('Temple garden');

    const crumbs = screen.getByRole('navigation', { name: 'Idea path' });
    const heading = within(crumbs).getByRole('heading', { name: 'Nanzen-ji' });
    const back = within(crumbs).getByRole('button', { name: /All ideas/ });
    expect(back).toBeInTheDocument();
    // Where you are LEADS the row now; the way back trails it.
    expect(heading.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(crumbs).getByText('1 inside')).toBeInTheDocument();
    // Nanzen-ji's seeded votes sum to +1, so the tally pill is up. The thumb
    // beside the number is aria-hidden SVG, so the pill's only text is the
    // total itself — found exactly, with the icon asserted as markup.
    const tally = within(crumbs).getByText('1');
    expect(tally.querySelector('svg')).not.toBeNull();
  });

  it('clicking "All ideas" climbs back to the root', async () => {
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    const user = userEvent.setup();
    renderBoard({ url: `/trips/1?path=${NANZENJI_ID}` });
    await within(ideas()).findByText('Temple garden');

    await user.click(screen.getByRole('button', { name: /All ideas/ }));

    expect(await within(ideas()).findByText('Kiyamachi')).toBeInTheDocument();
    expect(within(ideas()).queryByText('Temple garden')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All ideas' })).toBeInTheDocument();
  });

  it('clicking an ancestor crumb truncates the path to it', async () => {
    // Two levels: garden inside Nanzen-ji, bench inside the garden.
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    const { entries } = await api.get<{ entries: Entry[] }>('/entries', {
      params: { trip_id: TRIP_ID, kind: 'idea' },
    });
    const garden = entries.find((e) => e.title === 'Temple garden') as Entry;
    await addIdea({ title: 'A bench to read on' }, garden.id);

    const user = userEvent.setup();
    renderBoard({ url: `/trips/1?path=${NANZENJI_ID},${garden.id}` });
    await within(ideas()).findByText('A bench to read on');

    // The middle crumb is Nanzen-ji; clicking it lands on ITS level. Scoped
    // to the breadcrumb, because the map's pin buttons carry the name too.
    const crumbs = screen.getByRole('navigation', { name: 'Idea path' });
    await user.click(within(crumbs).getByRole('button', { name: /Nanzen-ji/ }));

    expect(await within(ideas()).findByText('Temple garden')).toBeInTheDocument();
    expect(within(ideas()).queryByText('A bench to read on')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nanzen-ji' })).toBeInTheDocument();
  });

  it('orders a deep breadcrumb: current idea, then the root crumb, then each ancestor', async () => {
    // Two levels: garden inside Nanzen-ji, bench inside the garden.
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    const { entries } = await api.get<{ entries: Entry[] }>('/entries', {
      params: { trip_id: TRIP_ID, kind: 'idea' },
    });
    const garden = entries.find((e) => e.title === 'Temple garden') as Entry;
    await addIdea({ title: 'A bench to read on' }, garden.id);

    renderBoard({ url: `/trips/1?path=${NANZENJI_ID},${garden.id}` });
    await within(ideas()).findByText('A bench to read on');

    // The whole row, in DOM order: the heading leads, then the way back —
    // root first, then the ancestors down — then the level's own facts.
    const crumbs = screen.getByRole('navigation', { name: 'Idea path' });
    const texts = Array.from(crumbs.children).map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(texts).toEqual(['Temple garden', 'All ideas ›', 'Nanzen-ji ›', '1 inside']);
  });

  it('ignores path ids the idea set cannot vouch for, falling back to root', async () => {
    renderBoard({ url: '/trips/1?path=999' });

    expect(await within(ideas()).findByText('Kiyamachi')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All ideas' })).toBeInTheDocument();
  });

  // The row-level way down: B2's rows draw the "N inside" affordance from the
  // insideCounts/onDrill props this board feeds them. Search text typed
  // against the old level must not follow you down.
  it('drilling from a row descends and clears the search text', async () => {
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    const search = screen.getByRole('searchbox', { name: 'Search ideas' });
    await user.type(search, 'nanzen');
    await within(ideas()).findByText('Nanzen-ji');

    await user.click(within(ideas()).getByRole('button', { name: /1 inside/ }));

    expect(await within(ideas()).findByText('Temple garden')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search ideas' })).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Nanzen-ji' })).toBeInTheDocument();
  });

  it('says what an empty drilled level is for, in capture words', async () => {
    // Nanzen-ji has no idea children in the plain seed.
    renderBoard({ url: `/trips/1?path=${NANZENJI_ID}` });

    expect(
      await screen.findByText('Nothing inside yet. Type above — it lands inside Nanzen-ji.'),
    ).toBeInTheDocument();
  });
});

describe('TripBoard — expanding rows', () => {
  it('holds two ideas open at once — opening the second never folds the first', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.click(within(ideas()).getByRole('button', { name: /^Nanzen-ji/ }));
    expect(within(ideas()).getByRole('button', { name: /^Nanzen-ji/ })).toHaveAttribute('aria-expanded', 'true');

    await user.click(within(ideas()).getByRole('button', { name: /^Kiyamachi/ }));

    expect(within(ideas()).getByRole('button', { name: /^Kiyamachi/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(ideas()).getByRole('button', { name: /^Nanzen-ji/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('a second click folds only its own row, leaving the other open', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.click(within(ideas()).getByRole('button', { name: /^Nanzen-ji/ }));
    await user.click(within(ideas()).getByRole('button', { name: /^Kiyamachi/ }));
    await user.click(within(ideas()).getByRole('button', { name: /^Kiyamachi/ }));

    expect(within(ideas()).getByRole('button', { name: /^Kiyamachi/ })).toHaveAttribute('aria-expanded', 'false');
    expect(within(ideas()).getByRole('button', { name: /^Nanzen-ji/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('drilling folds every open row — coming back finds the level closed again', async () => {
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.click(within(ideas()).getByRole('button', { name: /^Nanzen-ji/ }));
    await user.click(within(ideas()).getByRole('button', { name: /1 inside/ }));
    await within(ideas()).findByText('Temple garden');

    await user.click(screen.getByRole('button', { name: /All ideas/ }));
    await within(ideas()).findByText('Kiyamachi');

    expect(within(ideas()).getByRole('button', { name: /^Nanzen-ji/ })).toHaveAttribute('aria-expanded', 'false');
  });
});

/**
 * Several rows can be open, but the apricot "I'm here" edge belongs to ONE of
 * them — the focused row, worn as `data-focused` on the row's card. The board
 * moves it: opening a row focuses it, a press inside another open row claims
 * it, and closing the focused row retires it rather than promoting a row
 * nobody pointed at.
 */
describe('TripBoard — the focused open row', () => {
  /** The row's card element — where the data-expanded/data-focused hooks live. */
  function rowCard(name: RegExp): HTMLElement {
    const card = within(ideas()).getByRole('button', { name }).closest(`.${rowStyles.row}`);
    if (!card) throw new Error(`no row card for ${name}`);
    return card as HTMLElement;
  }

  /** Opens Nanzen-ji then Kiyamachi, leaving both open and Kiyamachi focused. */
  async function openBoth() {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');
    await user.click(within(ideas()).getByRole('button', { name: /^Nanzen-ji/ }));
    await user.click(within(ideas()).getByRole('button', { name: /^Kiyamachi/ }));
    return user;
  }

  it('with two rows open, only the last-opened one is focused', async () => {
    await openBoth();

    expect(rowCard(/^Kiyamachi/)).toHaveAttribute('data-focused');
    expect(rowCard(/^Nanzen-ji/)).not.toHaveAttribute('data-focused');
    // Both stay open — focus narrows the apricot, never the expansion.
    expect(rowCard(/^Nanzen-ji/)).toHaveAttribute('data-expanded');
    expect(rowCard(/^Kiyamachi/)).toHaveAttribute('data-expanded');
  });

  it('a pointerdown inside the other open row moves the focus to it', async () => {
    await openBoth();

    // A press on anything in Nanzen-ji's open card — here its own toggle,
    // pressed but not clicked, so the row is turned to without being folded.
    fireEvent.pointerDown(within(ideas()).getByRole('button', { name: /^Nanzen-ji/ }));

    expect(rowCard(/^Nanzen-ji/)).toHaveAttribute('data-focused');
    expect(rowCard(/^Kiyamachi/)).not.toHaveAttribute('data-focused');
  });

  it('closing the focused row leaves no row focused', async () => {
    const user = await openBoth();

    await user.click(within(ideas()).getByRole('button', { name: /^Kiyamachi/ }));

    expect(ideas().querySelector('[data-focused]')).toBeNull();
    // The survivor is still open; it just was not promoted to focused.
    expect(rowCard(/^Nanzen-ji/)).toHaveAttribute('data-expanded');
  });
});

/**
 * Clicking an idea inside a plan NAVIGATES the board to it: the drill lands on
 * the idea's own level, the filters reset (a jump that lands on a hidden row
 * would be navigation to nowhere), and the row arrives expanded, focused and
 * scrolled into view. The detail dialog this click used to raise is gone from
 * the board entirely — EntryDetailModal still backs /entries/:id, it just has
 * no way in from here.
 */
describe('TripBoard — opening an idea from a plan', () => {
  /** The plans rail — the only place a member's bare title is a button. */
  function plansRail(): HTMLElement {
    return screen.getByRole('complementary', { name: 'Plans' });
  }

  /** The row's card, found by the data-entry-id hook the scroll also uses. */
  function row(id: number): HTMLElement {
    const card = ideas().querySelector(`[data-entry-id="${id}"]`);
    if (!card) throw new Error(`no row card for entry ${id}`);
    return card as HTMLElement;
  }

  // jsdom implements no scrolling, so the smooth-scroll the jump asks for is
  // stubbed — which also makes it observable: the mock's `this` is the very
  // element the board brought into view.
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  let scrollIntoView: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('drills to a nested member: its parent leads the breadcrumb, its row open and focused', async () => {
    // A nested idea that is also a plan member: the garden lives inside
    // Nanzen-ji AND belongs to the market crawl.
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    const { entries } = await api.get<{ entries: Entry[] }>('/entries', {
      params: { trip_id: TRIP_ID, kind: 'idea' },
    });
    const garden = entries.find((e) => e.title === 'Temple garden') as Entry;
    await api.post(`/entries/${MARKET_BUNDLE_ID}/links`, { child_id: garden.id });

    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.click(within(plansRail()).getByRole('button', { name: 'Temple garden' }));

    // The board stands on the garden's level: its parent chain is the crumb row.
    expect(await within(ideas()).findByText('Temple garden')).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Idea path' });
    expect(within(crumbs).getByRole('heading', { name: 'Nanzen-ji' })).toBeInTheDocument();
    expect(row(garden.id)).toHaveAttribute('data-expanded');
    expect(row(garden.id)).toHaveAttribute('data-focused');

    // And the row was brought into view — the scroll landed on its card.
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView.mock.contexts[0]).toBe(row(garden.id));
  });

  it('keeps the path at root for a root member, with the row open', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    // Kiyamachi's parents are the trip and the night bundle — no idea among
    // them, so its level IS the root and the jump goes nowhere but its row.
    await user.click(within(plansRail()).getByRole('button', { name: 'Kiyamachi' }));

    expect(screen.getByRole('heading', { name: 'All ideas' })).toBeInTheDocument();
    expect(row(KIYAMACHI_ID)).toHaveAttribute('data-expanded');
    expect(row(KIYAMACHI_ID)).toHaveAttribute('data-focused');
  });

  it('raises no dialog — the jump replaced the modal', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.click(within(plansRail()).getByRole('button', { name: 'Kiyamachi' }));

    await waitFor(() => expect(row(KIYAMACHI_ID)).toHaveAttribute('data-expanded'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clears the active filters, so the jump can never land on a hidden row', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    // Search and a chip together: Kiyamachi is doubly hidden.
    await user.type(screen.getByRole('searchbox', { name: 'Search ideas' }), 'nanzen');
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(screen.getByRole('button', { name: 'Place' }));
    expect(await screen.findByText(/Showing 1 of 7/)).toBeInTheDocument();

    await user.click(within(plansRail()).getByRole('button', { name: 'Kiyamachi' }));

    // Both filters went with the jump — the whole level is back, Kiyamachi in it.
    expect(await screen.findByText(/Showing 7 of 7/)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search ideas' })).toHaveValue('');
    expect(screen.queryByText('Filtered, not gone — clear a chip to widen again.')).not.toBeInTheDocument();
    expect(within(ideas()).getByText('Kiyamachi')).toBeInTheDocument();
    expect(row(KIYAMACHI_ID)).toHaveAttribute('data-expanded');
  });
});

describe('TripBoard — capture', () => {
  it('quick add at root lands the idea under the trip', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    expect(screen.getByPlaceholderText('Add an idea…')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Capture an idea' }), 'Buy a rail pass');
    await user.click(screen.getByRole('button', { name: 'Quick add' }));

    expect(await screen.findByText('Added "Buy a rail pass". Nothing locked in.')).toBeInTheDocument();
    expect(await within(ideas()).findByText('Buy a rail pass')).toBeInTheDocument();
  });

  it('quick add while drilled lands the idea inside the current one', async () => {
    const user = userEvent.setup();
    renderBoard({ url: `/trips/1?path=${NANZENJI_ID}` });
    await screen.findByRole('heading', { name: 'Nanzen-ji' });

    expect(screen.getByPlaceholderText('Add inside Nanzen-ji…')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Capture an idea' }), 'Garden stroll');
    await user.click(screen.getByRole('button', { name: 'Quick add' }));

    expect(await screen.findByText('Added "Garden stroll". Nothing locked in.')).toBeInTheDocument();
    // On THIS level — which is the proof of the parent it was given.
    expect(await within(ideas()).findByText('Garden stroll')).toBeInTheDocument();

    const detail = await api.get<{ children: Entry[] }>(`/entries/${NANZENJI_ID}`);
    expect(detail.children.map((child) => child.title)).toContain('Garden stroll');
  });

  it('hands the composer whatever was typed, and the current drill as its parent', async () => {
    const user = userEvent.setup();
    renderBoard({ url: `/trips/1?path=${NANZENJI_ID}` });
    await screen.findByRole('heading', { name: 'Nanzen-ji' });

    await user.type(screen.getByRole('textbox', { name: 'Capture an idea' }), 'Moss viewing');
    await user.click(screen.getByRole('button', { name: 'Open composer' }));

    const composer = await screen.findByTestId('composer');
    expect(within(composer).getByText('composer title: Moss viewing')).toBeInTheDocument();
    expect(within(composer).getByText(`composer parents: ${NANZENJI_ID}`)).toBeInTheDocument();
    // Parent choices are every live idea on the trip.
    expect(within(composer).getByText('composer choices: 7')).toBeInTheDocument();
    // And the same set again as `allIdeas`, which is what lets each picker
    // result draw the path of ideas it lives inside.
    expect(within(composer).getByText('composer ancestors: 7')).toBeInTheDocument();
  });

  it('opens the composer with no preset parent at root', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: 'Open composer' }));

    const composer = await screen.findByTestId('composer');
    expect(within(composer).getByText('composer parents: none')).toBeInTheDocument();
  });

  it('a multi-parent submit creates once and links the remaining parents', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: 'Open composer' }));
    await user.click(await screen.findByRole('button', { name: 'Submit with two parents' }));

    expect(await screen.findByText('Added "Composed idea". Nothing locked in.')).toBeInTheDocument();
    // The composer closes once the idea is safely in.
    await waitFor(() => expect(screen.queryByTestId('composer')).not.toBeInTheDocument());

    // One idea, two homes: first parent via the create, second via a link.
    const nanzenji = await api.get<{ children: Entry[] }>(`/entries/${NANZENJI_ID}`);
    const kiyamachi = await api.get<{ children: Entry[] }>(`/entries/${KIYAMACHI_ID}`);
    expect(nanzenji.children.map((child) => child.title)).toContain('Composed idea');
    expect(kiyamachi.children.map((child) => child.title)).toContain('Composed idea');
    // Created once — the trip gained exactly one new idea.
    const { entries } = await api.get<{ entries: Entry[] }>('/entries', {
      params: { trip_id: TRIP_ID, kind: 'idea' },
    });
    expect(entries.filter((entry) => entry.title === 'Composed idea')).toHaveLength(1);
  });

  it('says the house sentence when the quick add fails', async () => {
    server.use(http.post('/api/entries', () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.type(screen.getByRole('textbox', { name: 'Capture an idea' }), 'Doomed');
    await user.click(screen.getByRole('button', { name: 'Quick add' }));

    expect(await screen.findByText("That didn't save. It's still here — try again.")).toBeInTheDocument();
  });
});

/**
 * An idea with nothing inside it used to be a dead end: the only way in was to
 * drill down to it and type in the capture bar. "Add an idea inside" puts the
 * composer in the card itself, already pointed at that idea.
 *
 * There is ONE composer on the board — the state that says whether it is open
 * also says where it is standing — so every test here is really a test of the
 * same invariant from a different side: opening it somewhere is the same act
 * as closing it wherever it was.
 */
describe('TripBoard — adding an idea inside a card', () => {
  /** Unfolds `title`'s row and presses the "Add an idea inside" in that card. */
  async function addInside(user: ReturnType<typeof userEvent.setup>, title: string) {
    const name = new RegExp(`^${title}`);
    await user.click(within(ideas()).getByRole('button', { name }));
    const card = within(ideas()).getByRole('button', { name }).closest(`.${rowStyles.row}`);
    if (!card) throw new Error(`no row card for ${title}`);
    await user.click(within(card as HTMLElement).getByRole('button', { name: 'Add an idea inside' }));
  }

  /** The one composer on screen, whichever card it is standing in. */
  function inline(): HTMLElement {
    return screen.getByTestId('inline-composer');
  }

  it('moves the composer into the card, pointed at that idea, and stands the top one down', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: 'Open composer' }));
    expect(await screen.findByTestId('composer')).toBeInTheDocument();

    await addInside(user, 'Nanzen-ji');

    expect(screen.queryByTestId('composer')).not.toBeInTheDocument();
    expect(within(inline()).getByText('composer host: Nanzen-ji')).toBeInTheDocument();
    expect(within(inline()).getByText(`composer parents: ${NANZENJI_ID}`)).toBeInTheDocument();
  });

  it('gives it back to the capture bar when the bar asks for it again', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await addInside(user, 'Nanzen-ji');
    expect(inline()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open composer' }));

    expect(screen.queryByTestId('inline-composer')).not.toBeInTheDocument();
    expect(screen.getByTestId('composer')).toBeInTheDocument();
  });

  it('never leaves two behind: pressing inside a second card moves the one composer there', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await addInside(user, 'Nanzen-ji');
    await addInside(user, 'Kiyamachi');

    expect(screen.getAllByTestId('inline-composer')).toHaveLength(1);
    expect(within(inline()).getByText('composer host: Kiyamachi')).toBeInTheDocument();
    // Nanzen-ji's row is still open — the composer left, the card did not fold.
    expect(within(ideas()).getByRole('button', { name: /^Nanzen-ji/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes the inline composer on the way down: a drill is a different level', async () => {
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await addInside(user, 'Kiyamachi');
    expect(inline()).toBeInTheDocument();

    await user.click(within(ideas()).getByRole('button', { name: /1 inside/ }));
    await within(ideas()).findByText('Temple garden');

    expect(screen.queryByTestId('inline-composer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('composer')).not.toBeInTheDocument();
  });

  it('closes the top-of-list composer on the way down too', async () => {
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: 'Open composer' }));
    expect(await screen.findByTestId('composer')).toBeInTheDocument();

    await user.click(within(ideas()).getByRole('button', { name: /1 inside/ }));
    await within(ideas()).findByText('Temple garden');

    expect(screen.queryByTestId('composer')).not.toBeInTheDocument();
  });

  it('closes it on the way back up as well — a crumb changes the level too', async () => {
    await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
    const user = userEvent.setup();
    renderBoard({ url: `/trips/1?path=${NANZENJI_ID}` });
    await within(ideas()).findByText('Temple garden');

    await addInside(user, 'Temple garden');
    expect(inline()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /All ideas/ }));
    await within(ideas()).findByText('Kiyamachi');

    expect(screen.queryByTestId('inline-composer')).not.toBeInTheDocument();
  });

  /**
   * The commit toast, in the three sentences it can say. The counted one is
   * the interesting case: the number it reports is `subtreeCount` + 1 over the
   * board's pre-add snapshot, which is the same function the row's
   * "N inside ›" pill reads — so the two are asserted together, and a change
   * that made them disagree would fail here rather than in the field.
   */
  describe('what the commit says', () => {
    it('counts the first one as first, and the pill agrees', async () => {
      const user = userEvent.setup();
      renderBoard();
      await within(ideas()).findByText('Nanzen-ji');

      await addInside(user, 'Nanzen-ji');
      await user.click(within(inline()).getByRole('button', { name: 'Submit as seeded' }));

      expect(await screen.findByText('Added inside Nanzen-ji. First one.')).toBeInTheDocument();
      expect(await within(ideas()).findByRole('button', { name: '1 inside ›' })).toBeInTheDocument();
      // Committed, so the composer is done — it does not stay standing.
      await waitFor(() => expect(screen.queryByTestId('inline-composer')).not.toBeInTheDocument());
    });

    it('counts the whole subtree, the same number the pill draws', async () => {
      // Two levels under Nanzen-ji: one direct child, one grandchild. The
      // subtree is 2 where the direct children are 1, so the sentence and the
      // pill can only agree on one of the two readings.
      await addIdea({ title: 'Temple garden' }, NANZENJI_ID);
      const { entries } = await api.get<{ entries: Entry[] }>('/entries', {
        params: { trip_id: TRIP_ID, kind: 'idea' },
      });
      const garden = entries.find((e) => e.title === 'Temple garden') as Entry;
      await addIdea({ title: 'A bench to read on' }, garden.id);

      const user = userEvent.setup();
      renderBoard();
      await within(ideas()).findByText('Nanzen-ji');
      expect(await within(ideas()).findByRole('button', { name: '2 inside ›' })).toBeInTheDocument();

      await addInside(user, 'Nanzen-ji');
      await user.click(within(inline()).getByRole('button', { name: 'Submit as seeded' }));

      expect(await screen.findByText('Added inside Nanzen-ji. 3 so far.')).toBeInTheDocument();
      expect(await within(ideas()).findByRole('button', { name: '3 inside ›' })).toBeInTheDocument();
    });

    it('says top level when every Inside chip was taken off', async () => {
      const user = userEvent.setup();
      renderBoard({ url: `/trips/1?path=${NANZENJI_ID}` });
      await screen.findByRole('heading', { name: 'Nanzen-ji' });

      await user.click(screen.getByRole('button', { name: 'Open composer' }));
      await user.click(await screen.findByRole('button', { name: 'Submit with no parents' }));

      expect(await screen.findByText('Added "Loose idea" at top level.')).toBeInTheDocument();
      // Filed under the trip, not the level that was on screen: the chips are
      // the parent set, and they were emptied.
      const detail = await api.get<{ children: Entry[] }>(`/entries/${NANZENJI_ID}`);
      expect(detail.children.map((child) => child.title)).not.toContain('Loose idea');
    });

    it('falls back to the house sentence when the chips point away from the host', async () => {
      const user = userEvent.setup();
      renderBoard();
      await within(ideas()).findByText('Nanzen-ji');

      await addInside(user, 'Nanzen-ji');
      await user.click(within(inline()).getByRole('button', { name: 'Submit filed elsewhere' }));

      expect(await screen.findByText('Added "Refiled idea". Nothing locked in.')).toBeInTheDocument();
      // And it really went where the chips said, not where the composer stood.
      const kiyamachi = await api.get<{ children: Entry[] }>(`/entries/${KIYAMACHI_ID}`);
      expect(kiyamachi.children.map((child) => child.title)).toContain('Refiled idea');
    });
  });
});

describe('TripBoard — searching', () => {
  it('narrows the list as you type, and says how much is left', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.type(screen.getByRole('searchbox', { name: 'Search ideas' }), 'kiyamachi');

    expect(await screen.findByText(/Showing 1 of 7/)).toBeInTheDocument();
    expect(within(ideas()).getByText('Kiyamachi')).toBeInTheDocument();
    expect(within(ideas()).queryByText('Nanzen-ji')).not.toBeInTheDocument();
  });
});

describe('TripBoard — filters still compose', () => {
  it('a category chip narrows the level, and its removable chip widens it again', async () => {
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(screen.getByRole('button', { name: 'Place' }));

    // Seven root ideas; Nanzen-ji is the only "place" among them.
    expect(await screen.findByText(/Showing 1 of 7/)).toBeInTheDocument();
    expect(screen.getByText('Filtered, not gone — clear a chip to widen again.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Place filter' }));

    expect(await screen.findByText(/Showing 7 of 7/)).toBeInTheDocument();
    expect(within(ideas()).getByText('Kiyamachi')).toBeInTheDocument();
  });
});

describe('TripBoard — the pins pick ideas', () => {
  it('a pin click marks the idea it belongs to', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    expect(screen.getByTestId('pin-selected')).toHaveTextContent('selected: null');
    await user.click(screen.getByRole('button', { name: pin('Nanzen-ji') }));
    expect(screen.getByTestId('pin-selected')).toHaveTextContent(`selected: ${NANZENJI_ID}`);
  });

  it('a pin click picks the idea while the board is selecting', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();
    await user.click(screen.getByRole('button', { name: 'Select several' }));

    await user.click(screen.getByRole('button', { name: pin('Nanzen-ji') }));

    expect(screen.getByRole('checkbox', { name: 'Select Nanzen-ji' })).toBeChecked();
    expect(screen.getByText('1 idea selected')).toBeInTheDocument();
  });

  it('opening a cluster picks its ideas and turns select mode on', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    await user.click(screen.getByRole('button', { name: 'Simulate cluster click' }));

    expect(await screen.findByText('2 ideas selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done selecting' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Nanzen-ji' })).toBeChecked();
  });
});

describe('TripBoard — select mode', () => {
  it('shows the pick circles only while selecting, and drops the picks on the way out', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    expect(screen.queryByRole('checkbox', { name: 'Select Nanzen-ji' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select several' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Nanzen-ji' }));
    expect(screen.getByText('1 idea selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done selecting' }));

    expect(screen.queryByRole('checkbox', { name: 'Select Nanzen-ji' })).not.toBeInTheDocument();
    expect(screen.queryByText('1 idea selected')).not.toBeInTheDocument();
  });

  it('adds the picked ideas to a plan, then puts the board back the way it was', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: 'Select several' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Nanzen-ji' }));
    await user.click(screen.getByRole('button', { name: 'Add to a plan' }));
    await user.click(screen.getByRole('button', { name: MARKET_BUNDLE_TITLE }));

    expect(await screen.findByText(`Added 1 idea to ${MARKET_BUNDLE_TITLE}.`)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select several' })).toBeInTheDocument());
    expect(screen.queryByText('1 idea selected')).not.toBeInTheDocument();

    const bundle = await api.get<{ children: { id: number }[] }>(`/entries/${MARKET_BUNDLE_ID}`);
    expect(bundle.children.map((child) => child.id)).toContain(NANZENJI_ID);
  });

  it('keeps "Make separate trips" and "Move to Set aside" beside the plan action', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: 'Select several' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Nanzen-ji' }));

    expect(screen.getByRole('button', { name: 'Make separate trips' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to Set aside' })).toBeInTheDocument();
  });
});

/**
 * Written in two halves on purpose: the first asserts the affordances are
 * gone, and the second asserts every idea is still on the screen. A test with
 * only the first half passes on a blank page, which is the one outcome
 * read-only mode must never produce.
 */
describe('TripBoard — as a viewer', () => {
  beforeEach(async () => {
    // Signed in and genuinely a viewer in the fixtures, not merely told to
    // render as one: GET /api/entries answers exactly as the app will see it.
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    setRole(TRIP_ID, 1, 'viewer');
  });

  it('takes every way of changing the board away', async () => {
    renderBoard({ role: 'viewer' });
    await screen.findByText('Nanzen-ji');

    // Capture replaced "+ New idea", and a viewer gets neither.
    expect(screen.queryByTestId('capture-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('composer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new idea/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new plan/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Drag Nanzen-ji/ })).not.toBeInTheDocument();
    // Select mode only ever led to a bar of edits, so the way in goes with them.
    expect(screen.queryByRole('button', { name: 'Select several' })).not.toBeInTheDocument();
  });

  it('still shows every idea, every plan and every count', async () => {
    renderBoard({ role: 'viewer' });

    await screen.findByText('Nanzen-ji');
    expect(within(ideas()).getByText('Nanzen-ji')).toBeInTheDocument();
    expect(within(ideas()).getByText('Kiyamachi')).toBeInTheDocument();
    expect(screen.getByText('A night out in Pontocho')).toBeInTheDocument();
    expect(screen.getByText(/Showing 7 of 7/)).toBeInTheDocument();
  });

  // Filtering, grouping, searching, drilling and the map decide what is on
  // screen, which is the whole of what reading along is. None of them may be
  // taken away with the edits.
  it('keeps every way of looking at the board', async () => {
    const user = userEvent.setup();
    renderBoard({ role: 'viewer' });
    await screen.findByText('Nanzen-ji');

    await mapUp();
    expect(screen.getByRole('searchbox', { name: 'Search ideas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: pin('Nanzen-ji') })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(screen.getByRole('button', { name: 'Place' }));
    expect(await screen.findByText(/Showing 1 of 7/)).toBeInTheDocument();
  });

  it('leaves nothing on the board that a drag could start from', async () => {
    renderBoard({ role: 'viewer' });
    await screen.findByText('Nanzen-ji');

    expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument();
  });

  it('gives the whole board back to a member', async () => {
    setRole(TRIP_ID, 1, 'member');
    const user = userEvent.setup();
    renderBoard({ role: 'member' });
    await screen.findByText('Nanzen-ji');

    expect(screen.getByTestId('capture-bar')).toBeInTheDocument();

    // The row's verbs live in its EXPANDED panel now, so the row has to be
    // unfolded before there is an actions row to find.
    await user.click(within(ideas()).getByRole('button', { name: /^Nanzen-ji/ }));
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to Set aside' })).toBeInTheDocument();
  });
});

/** A failed load is not a daydream — the board must never claim the trip is
 * empty about ideas it simply could not fetch. */
describe('TripBoard — when the load fails', () => {
  it('says the ideas failed to load instead of calling the trip empty, and offers a way back', async () => {
    server.use(http.get('/api/entries', () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    renderBoard();

    expect(
      await screen.findByText("Your ideas didn't load. Nothing is lost — everything on the board is still there."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/still a daydream/)).not.toBeInTheDocument();
    // The count line sits above the gate, so it has to step aside on its own:
    // "Showing 0 of 0" over an error message would be the same lie in numbers.
    expect(screen.queryByText(/Showing \d+ of \d+/)).not.toBeInTheDocument();
    // The map pane's pill would otherwise claim things about ideas that never
    // arrived — same countKnown gate, same silence.
    expect(screen.queryByText(/off view/)).not.toBeInTheDocument();
  });

  it('the rail says the plans failed instead of "No plans yet", and leaves the ideas alone', async () => {
    // Only the bundles request fails; returning nothing falls through to the
    // seeded handler, so the ideas half of the board loads as normal.
    server.use(
      http.get('/api/entries', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('kind') === 'bundle') {
          return HttpResponse.json({ error: 'boom' }, { status: 500 });
        }
        return undefined;
      }),
    );
    renderBoard();

    expect(
      await screen.findByText("Your plans didn't load. Nothing is lost — every group you've made is still here."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No plans yet/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // The ideas column is untouched by the rail's failure.
    expect(await screen.findByText('Nanzen-ji')).toBeInTheDocument();
  });
});

/** What a screen reader is being told about the drag, right now. */
function announcement(): string {
  return document.querySelector('[role="status"][aria-live="assertive"]')?.textContent ?? '';
}

/**
 * The live region speaks the board's words, not dnd-kit's — whose defaults
 * announce "Draggable item idea-1022 was dropped over droppable area
 * bundle-1030", internal ids nobody outside the codebase should ever hear.
 *
 * Only the sentences a drag can reach in jsdom are asserted through the live
 * region: with no layout engine every droppable measures 0×0, so the keyboard
 * sensor can never carry the idea OVER a plan here. The over-a-plan and
 * added-to-a-plan sentences are unit-tested in dragAnnouncements.test.ts
 * instead, and the wiring proven here covers them too — one `accessibility`
 * prop carries all five.
 */
describe('TripBoard — what a drag says out loud', () => {
  it('announces the lift and the cancel by title, in plan vocabulary', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    const grip = screen.getByRole('button', { name: /^Drag Nanzen-ji/ });
    grip.focus();
    await user.keyboard('[Space]');

    await waitFor(() => expect(announcement()).toBe('Picked up Nanzen-ji.'));

    await user.keyboard('{Escape}');

    await waitFor(() => expect(announcement()).toBe('Moving Nanzen-ji was cancelled.'));
  });

  it('says a drop that landed on nothing changed nothing', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    const grip = screen.getByRole('button', { name: /^Drag Nanzen-ji/ });
    grip.focus();
    await user.keyboard('[Space]');
    await waitFor(() => expect(announcement()).toBe('Picked up Nanzen-ji.'));

    // Dropped without moving: nothing is under it, so over is null.
    await user.keyboard('[Space]');

    await waitFor(() => expect(announcement()).toBe('Nanzen-ji was dropped. Nothing changed.'));
  });

  it('hands the keyboard path its instructions in the same words', async () => {
    renderBoard();
    await screen.findByText('Nanzen-ji');

    expect(screen.getByText(/Press space to lift the idea/)).toBeInTheDocument();
  });
});

/**
 * The card that follows the cursor while an idea is being dragged.
 *
 * @dnd-kit sizes the overlay from the node the drag came off — the grip, a 22px
 * button — and EntryRow has no intrinsic width of its own, so the overlay is
 * only as wide as it is told to be. When it was told nothing it drew as an empty
 * pill with the title clipped away entirely, which is the regression this
 * guards: you could not tell what you were dragging.
 */
describe('TripBoard — the card under the cursor', () => {
  it('shows the idea being dragged, at a width wide enough to read it', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    // Lifted by keyboard and left in the air: the overlay exists for as long as
    // the drag does, and nothing here is about where it lands.
    const grip = screen.getByRole('button', { name: /^Drag Nanzen-ji/ });
    grip.focus();
    await user.keyboard('[Space]');

    const overlay = await waitFor(() => {
      const card = document.querySelector<HTMLElement>(`.${styles.dragOverlayCard}`);
      if (!card) throw new Error('no drag overlay on screen');
      return card;
    });
    expect(within(overlay).getByText('Nanzen-ji')).toBeInTheDocument();
    expect(getComputedStyle(overlay).width).toBe('300px');

    await user.keyboard('{Escape}');
  });
});

/**
 * Folding the plans rail to its 56px sliver. jsdom applies no media queries,
 * so nothing here asserts computed layout — what belongs to the board and IS
 * testable is the mechanics: the flag flips, the column takes the collapsed
 * class BundlePanel and TripBoard.module.css act on, and the choice survives a
 * fresh mount because it lives in localStorage under 'wend:plans-collapsed'.
 */
describe('TripBoard — folding the plans rail', () => {
  // The flag persists BY DESIGN, which cuts both ways: a test that leaves it
  // behind would leak a folded rail into every later render in this file.
  beforeEach(() => localStorage.removeItem('wend:plans-collapsed'));
  afterEach(() => localStorage.removeItem('wend:plans-collapsed'));

  /** The rail's grid column — the element whose class the collapse flag drives. */
  function plansColumn(): HTMLElement {
    const column = screen.getByRole('complementary', { name: 'Plans' }).parentElement;
    if (!column) throw new Error('the plans rail has no column around it');
    return column;
  }

  it('starts expanded, folds from the heading, and writes the choice down', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    const column = plansColumn();
    expect(column).toHaveClass(styles.plans);
    expect(column).not.toHaveClass(styles.plansCollapsed);

    await user.click(screen.getByRole('button', { name: 'Collapse plans' }));

    expect(column).toHaveClass(styles.plansCollapsed);
    expect(screen.getByRole('button', { name: 'Expand plans' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse plans' })).not.toBeInTheDocument();
    expect(localStorage.getItem('wend:plans-collapsed')).toBe('true');
  });

  it('comes back folded on a fresh render, and expanding writes the flag back', async () => {
    localStorage.setItem('wend:plans-collapsed', 'true');
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    const column = plansColumn();
    expect(column).toHaveClass(styles.plansCollapsed);

    await user.click(screen.getByRole('button', { name: 'Expand plans' }));

    expect(column).not.toHaveClass(styles.plansCollapsed);
    expect(screen.getByRole('button', { name: 'Collapse plans' })).toBeInTheDocument();
    expect(localStorage.getItem('wend:plans-collapsed')).toBe('false');
  });
});
