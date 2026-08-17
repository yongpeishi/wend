import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { findEntry, setRole } from '../mocks/db';
import { TripItinerary } from './TripItinerary';
import { TripLayout } from './TripLayout';

// Integration test: the real container, the real TripLayout that hands it the
// trip, and the MSW fixtures (src/mocks) standing in for the Rails API. The
// layout is not a stand-in here because the dates gate writes to the trip
// entry and then has to see the new dates come back through it.
//
// The seeded trip (src/mocks/db.ts) is "Six days in Kyoto", 2–8 Nov 2026:
//   Day 1 · Mon 2   lodging, a bundle and an idea with a 1 hr 20 hole between
//   Day 2 · Tue 3   two live versions, nothing settled
//   Day 3 · Wed 4   lodging, one live version and one archived
//   Days 4–7        untouched
// Kiyamachi, Coffee at Weekenders and Nishiki market are in no live version,
// so the rail starts with three things in it.

/**
 * The same raise TripBoard.test.tsx made, and for the same reason. Every render
 * in this file paints seven days, three of them populated, and several cases
 * expand the whole list and then string a dozen keyboard events over it; the
 * viewer block below adds seven more full renders on top. The 5s default is no
 * longer comfortable here on a loaded machine, and nothing in this file is
 * meant to be a performance assertion — a timeout here says the laptop was
 * busy, not that the itinerary is wrong.
 */
vi.setConfig({ testTimeout: 15_000 });

const SEEDED_TRIP_ID = 1;

function renderItinerary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/trips/${SEEDED_TRIP_ID}/itinerary`]}>
          <Routes>
            <Route path="/trips/:id" element={<TripLayout />}>
              <Route path="itinerary" element={<TripItinerary />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Date inputs are filled by the browser's own control, not by keystrokes. */
function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** One day's element, open or closed, found by the id its drop target carries. */
function dayBox(iso: string): HTMLElement {
  const box = document.querySelector(`[data-drop-id="itinerary-day-${iso}"]`);
  if (!box) throw new Error(`no day on screen for ${iso}`);
  return box as HTMLElement;
}

/** Opens one day by clicking its collapsed row. */
async function openDay(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByText(label));
  return screen.findByRole('heading', { name: label });
}

/**
 * Gives the drop targets rectangles, for the length of one test.
 *
 * jsdom lays every element out at 0×0 on the origin, and @dnd-kit resolves a
 * drop entirely by geometry, so without this a drag has nothing to aim at and
 * every target is equally the winner. The shape stated here is the real one:
 * a day card, and — when the day is split — two columns side by side *inside*
 * it, which is the nesting that made the day swallow the drop (feedback 014#2).
 *
 * The targets name themselves in the DOM as `data-drop-id`, so this needs no
 * knowledge of the components beyond that one attribute. It only reaches the
 * open days, which is why the drag tests expand the list first: a collapsed
 * row would keep jsdom's 0×0 at the origin and win everything by default.
 */
function layOutDropTargets() {
  const original = Element.prototype.getBoundingClientRect;
  const WIDTH = 600;
  const HEAD = 60;
  const COLUMNS = 200;
  const ROW = 80;
  const GAP = 10;

  function box(left: number, top: number, width: number, height: number): DOMRect {
    return {
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({}),
    } as DOMRect;
  }

  /** Recomputed per call: opening a day adds targets mid-test. */
  function boxes() {
    const laidOut = new Map<string, DOMRect>();
    let top = 0;
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-drop-id]')).filter(
      (element) => !element.dataset.dropId?.includes('-version-'),
    );

    for (const card of cards) {
      const columns = Array.from(card.querySelectorAll<HTMLElement>('[data-drop-id]'));
      const height = columns.length > 0 ? HEAD + COLUMNS : ROW;
      laidOut.set(card.dataset.dropId as string, box(0, top, WIDTH, height));
      columns.forEach((column, index) => {
        laidOut.set(
          column.dataset.dropId as string,
          box((index * WIDTH) / columns.length, top + HEAD, WIDTH / columns.length, COLUMNS),
        );
      });
      top += height + GAP;
    }

    return laidOut;
  }

  Element.prototype.getBoundingClientRect = function measured(this: Element) {
    const id = (this as HTMLElement).dataset?.dropId;
    return (id ? boxes().get(id) : undefined) ?? original.call(this);
  };

  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

/**
 * Lets the page be scrolled under a drag that is already in flight.
 *
 * @dnd-kit measures a drop target once, into a rectangle that subtracts its
 * scrolling ancestor's current offset every time it is read — so moving
 * `document.scrollingElement`'s scrollTop moves every target, exactly as a real
 * scroll does, with no re-measure. The drag overlay is `position: fixed` and has
 * no scrolling ancestor, so it stays where it was put: the page slides out from
 * under it. That is the situation the keyboard sensor creates for itself every
 * time an arrow key aims at something off-screen (it scrolls the page instead of
 * moving the drag), and it is the situation feedback 014#2's fix has to survive.
 */
function letThePageScroll() {
  let scrolled = 0;
  const root = document.documentElement;

  // jsdom leaves `document.scrollingElement` undefined, and without it @dnd-kit
  // finds no scrolling ancestor at all and treats the page as unscrollable.
  Object.defineProperty(document, 'scrollingElement', { configurable: true, get: () => root });
  Object.defineProperty(root, 'scrollTop', { configurable: true, get: () => scrolled });
  // Reachable only once there is a scrolling ancestor, and unimplemented in
  // jsdom: @dnd-kit brings the lifted thing into view when a drag starts.
  const scrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function noop() {};
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrolled });

  // jsdom has no ResizeObserver, so @dnd-kit never measures the drag overlay
  // and falls back to measuring the grip the drag came off — an ordinary
  // element, which scrolls with the page and so hides the very drift this is
  // about. One that reports immediately restores the browser's arrangement: a
  // `position: fixed` overlay, measured once and staying put, over drop targets
  // that move.
  const noObserver = !('ResizeObserver' in window);
  if (noObserver) {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
      readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    };
  }

  async function scrollBy(pixels: number) {
    scrolled += pixels;
    // @dnd-kit only re-reads the offsets when it hears about the scroll.
    await act(async () => {
      fireEvent.scroll(window);
      await Promise.resolve();
    });
  }

  function restore() {
    delete (root as unknown as Record<string, unknown>).scrollTop;
    delete (window as unknown as Record<string, unknown>).scrollY;
    delete (document as unknown as Record<string, unknown>).scrollingElement;
    Element.prototype.scrollIntoView = scrollIntoView;
    if (noObserver) delete (window as unknown as Record<string, unknown>).ResizeObserver;
  }

  return { scrollBy, restore };
}

/** What a screen reader is being told about the drag, right now. */
function announcement(): string {
  return document.querySelector('[role="status"][aria-live="assertive"]')?.textContent ?? '';
}

/**
 * Lifts a drag by keyboard and carries it until the announcement names
 * `target`, leaving it in the air. Arrow-by-arrow rather than a fixed number of
 * presses: the point being proved is that the target is reachable and says so,
 * not how many presses away it happens to sit.
 */
async function carryByKeyboardOnto(user: ReturnType<typeof userEvent.setup>, grip: HTMLElement, target: string) {
  grip.focus();
  await user.keyboard('[Space]');
  // The lift measures the targets and attaches the arrow-key listener on the
  // next task, so the first arrow has to wait for it.
  await waitFor(() => expect(announcement()).not.toBe(''));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  for (let press = 0; press < 12 && !announcement().includes(target); press += 1) {
    await user.keyboard('{ArrowDown}');
  }
  if (!announcement().includes(target)) {
    throw new Error(`Never reached ${target}. The drag ended up: ${announcement()}`);
  }
}

/** Carries it there and lets it go. */
async function dragByKeyboardOnto(user: ReturnType<typeof userEvent.setup>, grip: HTMLElement, target: string) {
  await carryByKeyboardOnto(user, grip, target);
  await user.keyboard('[Space]');
}

describe('TripItinerary — the dates gate', () => {
  it('asks for the dates before drawing any days, and opens them once it has both', async () => {
    const trip = findEntry(SEEDED_TRIP_ID);
    if (trip) {
      trip.starts_on = null;
      trip.ends_on = null;
    }
    const user = userEvent.setup();
    renderItinerary();

    expect(await screen.findByRole('heading', { level: 2, name: 'When are you going?' })).toBeInTheDocument();
    // Even with the gate up, the trip's title is still the page's only <h1>.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    // Counted once the trip's ideas and bundles land — the gate draws as soon
    // as the trip does and fills its own line in.
    expect(await screen.findByText(/You've kept 9 things for Six days in Kyoto/)).toBeInTheDocument();
    expect(screen.queryByText('Day 1 · Mon 2')).not.toBeInTheDocument();

    setDate('First day', '2026-11-02');
    setDate('Last day', '2026-11-04');
    await user.click(screen.getByRole('button', { name: 'Open the days' }));

    // The gate PATCHes the trip itself, so the days appear only once the trip
    // has come back with its new dates — three of them, counting both ends.
    expect(await screen.findByText('Day 1 · Mon 2')).toBeInTheDocument();
    expect(screen.getByText('Day 3 · Wed 4')).toBeInTheDocument();
    expect(screen.queryByText('Day 4 · Thu 5')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'When are you going?' })).not.toBeInTheDocument();
  });

  it('comes back prefilled when "Change dates" reopens it over a trip that has them', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');

    await user.click(screen.getByRole('button', { name: 'Change dates' }));

    expect(screen.getByLabelText('First day')).toHaveValue('2026-11-02');
    expect(screen.getByLabelText('Last day')).toHaveValue('2026-11-08');

    // Backing out from here is a change of mind about the dates, not about the
    // screen: it returns to the day list rather than leaving for the board —
    // and the button says so, because the trip already has days to go back to.
    expect(screen.queryByRole('button', { name: 'Back to ideas' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to your days' }));
    expect(await screen.findByText('Day 1 · Mon 2')).toBeInTheDocument();
  });
});

/**
 * Feedback 014#4 and 014#5. Moving the dates carries the plan with them, so
 * Day 2 stays Day 2 — but a shorter trip has nowhere to put the days off its
 * end. The server refuses that write and answers with the dates it would have
 * to clear; nothing is written until the same call comes back confirmed.
 *
 * The seeded trip runs 2–8 Nov with rows on the 2nd, 3rd and 4th, so ending it
 * on the 3rd drops exactly one day — the one carrying the night out (in its
 * live version) and the coffee (in its archived one).
 */
describe('TripItinerary — dates that would cost a day', () => {
  /** Reopens the gate and asks for a trip that ends a day early. */
  async function shortenTheTrip(user: ReturnType<typeof userEvent.setup>) {
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');
    await user.click(screen.getByRole('button', { name: 'Change dates' }));
    setDate('Last day', '2026-11-03');
    await user.click(screen.getByRole('button', { name: 'Open the days' }));
    return screen.findByRole('heading', { name: 'Change the dates and clear 1 day?' });
  }

  it('asks first, and has changed nothing by the time it asks', async () => {
    const user = userEvent.setup();
    await shortenTheTrip(user);

    expect(
      screen.getByText("4 Nov falls outside the new dates, so what you've placed on it comes off."),
    ).toBeInTheDocument();
    // One idea, not two rows: the coffee on that day is in its archived
    // version, so it is on the rail already and nothing about it comes back.
    expect(
      screen.getByText(
        '1 idea goes back to "Not placed yet", so nothing is lost — you can place it on another day.',
      ),
    ).toBeInTheDocument();
    // The write was refused outright: the trip still runs to the 8th.
    expect(findEntry(SEEDED_TRIP_ID)?.ends_on).toBe('2026-11-08');
  });

  it('leaves the trip alone when the answer is no, on the dates you typed', async () => {
    const user = userEvent.setup();
    await shortenTheTrip(user);

    await user.click(screen.getByRole('button', { name: "No, don't change the dates" }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Still the gate, still holding what was typed — cancelling is a change of
    // mind about the warning, not about the dates.
    expect(screen.getByLabelText('Last day')).toHaveValue('2026-11-03');
    expect(findEntry(SEEDED_TRIP_ID)?.ends_on).toBe('2026-11-08');

    await user.click(screen.getByRole('button', { name: 'Back to your days' }));
    expect(await screen.findByText('Day 7 · Sun 8')).toBeInTheDocument();
    expect(await screen.findByText('Not placed yet · 3')).toBeInTheDocument();
  });

  it('clears the day when the answer is yes, and the ideas on it come back to the rail', async () => {
    const user = userEvent.setup();
    await shortenTheTrip(user);

    await user.click(screen.getByRole('button', { name: 'Yes, clear that day' }));

    expect(await screen.findByText('Day 2 · Tue 3')).toBeInTheDocument();
    expect(screen.queryByText('Day 3 · Wed 4')).not.toBeInTheDocument();
    // Nothing kept was destroyed: the night out was only ever placed on that
    // day, so losing the day puts it back among the things waiting.
    expect(await screen.findByText('Not placed yet · 4')).toBeInTheDocument();
    expect(screen.getByText('A night out in Pontocho')).toBeInTheDocument();
    expect(screen.getByText('Your days are open. What came off is waiting on the right.')).toBeInTheDocument();
  });

  it('says nothing at all when the new dates cost no day', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');

    // Two days later at both ends: everything planned moves with it, so there
    // is nothing to warn about and nothing to confirm.
    await user.click(screen.getByRole('button', { name: 'Change dates' }));
    setDate('First day', '2026-11-04');
    setDate('Last day', '2026-11-10');
    await user.click(screen.getByRole('button', { name: 'Open the days' }));

    expect(await screen.findByText('Day 1 · Wed 4')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Day 1's plan is still Day 1's plan, two dates along.
    expect(within(dayBox('2026-11-04')).getByText('Nanzen-ji · Nishiki market crawl')).toBeInTheDocument();
    expect(await screen.findByText('Not placed yet · 3')).toBeInTheDocument();
  });
});

/**
 * Feedback 014#6: "Add ability to swap day. Eg: Move day 2 to be day 3."
 *
 * An exchange, not a reorder — Day 3 comes back to Day 2 rather than being
 * pushed along. Everything the date owns travels with it, lodging included.
 */
describe('TripItinerary — swapping two days', () => {
  it('exchanges two planned days from a closed row, pushing nothing along', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');

    await user.click(screen.getByRole('button', { name: 'Swap Day 1 · Mon 2 with another day' }));
    await user.click(screen.getByRole('button', { name: 'Swap with Day 3 · Wed 4' }));

    const first = await screen.findByText('A night out in Pontocho');
    expect(dayBox('2026-11-02')).toContainElement(first);
    expect(within(dayBox('2026-11-04')).getByText('Nanzen-ji · Nishiki market crawl')).toBeInTheDocument();
    // Lodging travels with the day it belongs to.
    expect(within(dayBox('2026-11-02')).getByText('Sleeping on the night train')).toBeInTheDocument();
    expect(within(dayBox('2026-11-04')).getByText('Machiya near Gion')).toBeInTheDocument();
    // The day between them was never touched, and no fourth day appeared.
    expect(within(dayBox('2026-11-03')).getByText('2 versions · not settled')).toBeInTheDocument();
    expect(screen.getAllByText('Nothing here yet')).toHaveLength(4);
    expect(screen.getByText('Day 1 · Mon 2 and Day 3 · Wed 4 have swapped.')).toBeInTheDocument();
  });

  it('moves the plan onto an empty day, rather than refusing to swap with one', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');

    await user.click(screen.getByRole('button', { name: 'Swap Day 1 · Mon 2 with another day' }));
    await user.click(screen.getByRole('button', { name: 'Swap with Day 6 · Sat 7' }));

    const moved = await within(dayBox('2026-11-07')).findByText('Nanzen-ji · Nishiki market crawl');
    expect(moved).toBeInTheDocument();
    expect(within(dayBox('2026-11-07')).getByText('Machiya near Gion')).toBeInTheDocument();
    // And the day it came from is now the empty one.
    expect(within(dayBox('2026-11-02')).getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('offers the same swap from the open day, and never offers the day itself', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');
    await openDay(user, 'Day 1 · Mon 2');

    await user.click(screen.getByRole('button', { name: 'Swap Day 1 · Mon 2 with another day' }));
    expect(screen.queryByRole('button', { name: 'Swap with Day 1 · Mon 2' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Swap with Day 2 · Tue 3' }));

    // Day 1 stays open on its date, now showing what Day 2 was holding: two
    // versions, neither settled.
    expect(await within(dayBox('2026-11-02')).findByRole('heading', { name: 'Version B' })).toBeInTheDocument();
    expect(within(dayBox('2026-11-03')).getByText('Nanzen-ji · Nishiki market crawl')).toBeInTheDocument();
  });
});

describe('TripItinerary — the day list', () => {
  it('draws every date of the trip, placed or not, with what is on it', async () => {
    renderItinerary();

    expect(await screen.findByText('Day 1 · Mon 2')).toBeInTheDocument();
    expect(screen.getByText('Day 7 · Sun 8')).toBeInTheDocument();
    expect(screen.getByText('Nanzen-ji · Nishiki market crawl')).toBeInTheDocument();
    // An empty day is a legitimate day, never an error.
    expect(screen.getAllByText('Nothing here yet')).toHaveLength(4);
    expect(screen.getByText('Machiya near Gion')).toBeInTheDocument();
  });

  it("states the trip's length, and says once that a day is unsettled", async () => {
    renderItinerary();

    // The length only: the date range belongs to TripLayout's title block, and
    // this screen would otherwise print 2–8 Nov twice on the one page.
    expect(await screen.findByText('7 days')).toBeInTheDocument();
    expect(screen.getAllByText('2–8 Nov')).toHaveLength(1);
    // One day of the seven carries two live versions.
    expect(screen.getByText('1 day split · not settled')).toBeInTheDocument();
    expect(screen.getByText('2 versions · not settled')).toBeInTheDocument();
  });

  it("leaves the trip's title as the page's only <h1>, with the itinerary a section under it", async () => {
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');

    const [h1, ...rest] = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Six days in Kyoto');
    expect(rest).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2, name: 'Itinerary' })).toBeInTheDocument();
  });

  it('opens every day at once and closes them all again', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');

    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getAllByRole('heading', { name: /^Day \d · / })).toHaveLength(7);

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByRole('heading', { name: /^Day \d · / })).not.toBeInTheDocument();
    expect(screen.getByText('Day 1 · Mon 2')).toBeInTheDocument();
  });

  it('opens one day on its own, leaving the rest closed', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');

    await openDay(user, 'Day 1 · Mon 2');

    expect(screen.getAllByRole('heading', { name: /^Day \d · / })).toHaveLength(1);
    // The open day draws its running order, and the hole in the middle of it.
    expect(screen.getByText('Bundle · Nishiki market crawl')).toBeInTheDocument();
    expect(screen.getByText('Nothing planned · 1 hr 20')).toBeInTheDocument();
  });
});

describe('TripItinerary — placing what is waiting', () => {
  it('places a kept idea on a day from the rail, with no dragging at all', async () => {
    const user = userEvent.setup();
    renderItinerary();
    expect(await screen.findByText('Not placed yet · 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Kiyamachi to a day' }));
    await user.click(screen.getByRole('button', { name: 'Add to Day 4 · Thu 5' }));

    // The day had no row on the server at all: the API makes it, and its first
    // version, on the way in. It opens so the placement is visible.
    expect(
      await screen.findByRole('button', { name: 'Change the hours for Kiyamachi, now 09:00–10:30' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Day 4 · Thu 5' })).toBeInTheDocument();
    // Placed somewhere, so it stops waiting — but nothing was consumed: the
    // other two are still on the rail.
    expect(await screen.findByText('Not placed yet · 2')).toBeInTheDocument();
  });
});

/**
 * Feedback 014#2: "When there is 2 versions, dragging an idea into day only
 * append Version A. Unable to drag into version B."
 *
 * Driven by the keyboard throughout, and not only for coverage: the pointer
 * sensor needs a stream of intermediate pointermove events that neither jsdom
 * nor the browser check that verifies this screen can produce. The keyboard is
 * the route that can be driven end to end, so it is the route the fix is
 * pinned to — and it is the route a keyboard user has either way.
 */
describe('TripItinerary — dragging onto a split day', () => {
  let restoreLayout: () => void;

  beforeEach(() => {
    restoreLayout = layOutDropTargets();
  });
  afterEach(() => restoreLayout());

  /** Every day open, so every day is a card with a rectangle to aim at. */
  async function openEveryDay(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText('Day 2 · Tue 3');
    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    // Day 2 is the seeded split day: Version A and Version B, neither settled.
    await screen.findByRole('heading', { name: 'Version B' });
  }

  it('places into Version B when Version B is what the drag was carried to', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await openEveryDay(user);

    await dragByKeyboardOnto(
      user,
      screen.getByRole('button', { name: 'Drag Kiyamachi onto a day' }),
      'Version B of Day 2 · Tue 3',
    );

    // In Version B's column, and in no other. Before the fix the day was the
    // only target it could resolve to, and every drop landed in Version A.
    const columnB = await screen.findByRole('heading', { name: 'Version B' });
    const inB = columnB.closest('[data-drop-id]') as HTMLElement;
    expect(await within(inB).findByText('Kiyamachi')).toBeInTheDocument();

    const inA = screen.getByRole('heading', { name: 'Version A' }).closest('[data-drop-id]') as HTMLElement;
    expect(within(inA).queryByText('Kiyamachi')).not.toBeInTheDocument();
    expect(await screen.findByText('Not placed yet · 2')).toBeInTheDocument();
  });

  it('names the version being aimed at, rather than only the day', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await openEveryDay(user);

    const grip = screen.getByRole('button', { name: 'Drag Kiyamachi onto a day' });
    grip.focus();
    await user.keyboard('[Space]');
    await waitFor(() => expect(announcement()).not.toBe(''));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Every stop on the walk is announced. Both ends of the list, so nothing
    // is missed for having started in the middle of it.
    const heard = new Set<string>([announcement()]);
    for (let press = 0; press < 10; press += 1) {
      await user.keyboard('{ArrowUp}');
      heard.add(announcement());
    }
    for (let press = 0; press < 10; press += 1) {
      await user.keyboard('{ArrowDown}');
      heard.add(announcement());
    }
    await user.keyboard('{Escape}');

    // The two versions of the split day are two stops with two names.
    expect([...heard]).toContain('Kiyamachi is over Version A of Day 2 · Tue 3.');
    expect([...heard]).toContain('Kiyamachi is over Version B of Day 2 · Tue 3.');
    // The day around them is never a stop while its columns are on screen —
    // it would be "Version A by default", one press before Version A itself.
    expect([...heard]).not.toContain('Kiyamachi is over Day 2 · Tue 3.');
    // Every other day still is one.
    expect([...heard]).toContain('Kiyamachi is over Day 1 · Mon 2.');
    expect([...heard]).toContain('Kiyamachi is over Day 7 · Sun 8.');
  });

  it('leaves an unsplit day to pick its own version, and omits the id the API has to mint', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await openEveryDay(user);

    // Day 4 has no row on the server at all, so the only version the screen
    // can draw is the synthetic one, whose id is a placeholder. Sending that id
    // would 422: the placement has to leave day_version_id out and let the API
    // make both the day and its Version A. An unsplit day is one target, and
    // the version it resolves to is the day's business, not the drop's.
    await dragByKeyboardOnto(
      user,
      screen.getByRole('button', { name: 'Drag Kiyamachi onto a day' }),
      'Day 4 · Thu 5',
    );

    expect(
      await screen.findByRole('button', { name: 'Change the hours for Kiyamachi, now 09:00–10:30' }),
    ).toBeInTheDocument();
    expect(screen.queryByText("That didn't save. It's still here — try again.")).not.toBeInTheDocument();
    expect(await screen.findByText('Not placed yet · 2')).toBeInTheDocument();
  });

  /**
   * The invariant the whole fix rests on: **what the drop lands on is what the
   * announcement named**, not what happens to be under the drag by the time the
   * key comes up.
   *
   * The keyboard sensor deliberately leaves a drag where it is and scrolls the
   * page instead whenever the target it is aiming at sits past the middle of the
   * screen, so the ground moving under a stationary drag is the normal case, not
   * a freak one. Scrolling one whole day's worth here puts the *next* day's
   * column exactly where Version B's was — so anything resolving the drop by
   * geometry at drop time places it on the wrong day, silently, which is
   * feedback 014#2 all over again.
   */
  it('drops on the target it announced even when the page scrolls out from under the drag', async () => {
    const user = userEvent.setup();
    const page = letThePageScroll();
    try {
      renderItinerary();
      await openEveryDay(user);

      await carryByKeyboardOnto(
        user,
        screen.getByRole('button', { name: 'Drag Kiyamachi onto a day' }),
        'Version B of Day 2 · Tue 3',
      );

      // A day and a half of the list goes by under the drag, which has not moved.
      await page.scrollBy(400);

      // Nothing about the drag changed, so nothing about it is re-announced.
      expect(announcement()).toBe('Kiyamachi is over Version B of Day 2 · Tue 3.');

      await user.keyboard('[Space]');

      expect(announcement()).toBe('Kiyamachi was left on Version B of Day 2 · Tue 3.');
      const inB = (await screen.findByRole('heading', { name: 'Version B' })).closest(
        '[data-drop-id]',
      ) as HTMLElement;
      expect(await within(inB).findByText('Kiyamachi')).toBeInTheDocument();
      expect(await screen.findByText('Not placed yet · 2')).toBeInTheDocument();
    } finally {
      page.restore();
    }
  });

  it('does not let the day take a drop one of its columns has already taken', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await openEveryDay(user);

    await dragByKeyboardOnto(
      user,
      screen.getByRole('button', { name: 'Drag Kiyamachi onto a day' }),
      'Version B of Day 2 · Tue 3',
    );
    await screen.findByText('Not placed yet · 2');

    // One placement on the day, not two: the column and the day around it are
    // mutually exclusive, so the day's own monitor stayed quiet rather than
    // placing a second copy into Version A alongside the column's.
    const day2 = screen.getByRole('heading', { name: 'Day 2 · Tue 3' }).closest('[data-drop-id]') as HTMLElement;
    await waitFor(() => expect(within(day2).getAllByText('Kiyamachi')).toHaveLength(1));
  });
});

describe('TripItinerary — versions', () => {
  it('forks a day into a second version, and says the trip has another day unsettled', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');
    await openDay(user, 'Day 1 · Mon 2');

    await user.click(screen.getByRole('button', { name: 'Fork this day' }));

    expect(await screen.findByRole('heading', { name: 'Version B' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Version A' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('2 days split · not settled')).toBeInTheDocument());
  });

  it('settles a split day on one version and keeps the other in Archived', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 2 · Tue 3');
    await openDay(user, 'Day 2 · Tue 3');

    // The seeded day already has one archived version elsewhere in the trip, so
    // keeping this one takes the panel from one to two.
    expect(screen.getByRole('button', { name: /Archived · 1/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Keep Version B for Day 2 · Tue 3/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Archived · 2/ })).toBeInTheDocument());
    // Settled: one version left, and nothing left to say about it.
    expect(screen.queryByRole('heading', { name: 'Version B' })).not.toBeInTheDocument();
    expect(screen.queryByText('2 versions · not settled')).not.toBeInTheDocument();
    expect(screen.queryByText(/day split · not settled/)).not.toBeInTheDocument();
  });

  it('shows what was set aside, and brings it back onto its own day', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 3 · Wed 4');

    // Collapsed behind a count: it is rarely reached, and the rail belongs to
    // the things still waiting to be placed.
    expect(screen.queryByText('Day 3 · Wed 4 · Version B')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Archived · 1/ }));

    // Trip-wide, so the row has to name the day it came from.
    expect(screen.getByText('Day 3 · Wed 4 · Version B')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bring back Day 3 · Wed 4 · Version B' }));

    // Back as a live version beside the one that was kept, on an opened day.
    expect(await screen.findByRole('heading', { name: 'Day 3 · Wed 4' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Version B' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archived · / })).not.toBeInTheDocument();
  });
});

/**
 * Requirement readonly §3. The backend already turns a viewer away, so this is
 * the client side of a door that is already locked — and the point of closing
 * it here is that a viewer stops finding out by pressing something and reading
 * a save error.
 *
 * Written in two halves throughout, the way TripBoard's viewer tests are: one
 * half asserts the ways in are gone, the other asserts the plan is still all
 * there. A suite with only the first half passes on a blank screen, which is
 * the one outcome read-only must never produce.
 */
describe('TripItinerary — as a viewer', () => {
  beforeEach(async () => {
    // Signed in and genuinely a viewer in the fixtures, not merely told to
    // render as one: TripLayout reads `my_role` off the trip the API answers
    // with and mounts the role provider from it, exactly as the app does.
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    setRole(SEEDED_TRIP_ID, 1, 'viewer');
  });

  it('still shows every day and everything on it', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');
    await user.click(screen.getByRole('button', { name: 'Expand all' }));

    expect(screen.getAllByRole('heading', { name: /^Day \d · / })).toHaveLength(7);

    // Day 1 in full: what is on it, in the hours it is on it, with the hole
    // between the two things drawn in and the night spoken for.
    const day1 = dayBox('2026-11-02');
    expect(within(day1).getByText('Bundle · Nishiki market crawl')).toBeInTheDocument();
    expect(within(day1).getByText('09:00–09:40')).toBeInTheDocument();
    expect(within(day1).getByText('Nothing planned · 1 hr 20')).toBeInTheDocument();
    expect(within(day1).getByText('Machiya near Gion')).toBeInTheDocument();

    // The undecided day is still visibly undecided, both ways round.
    const day2 = dayBox('2026-11-03');
    expect(within(day2).getByRole('heading', { name: 'Version A' })).toBeInTheDocument();
    expect(within(day2).getByRole('heading', { name: 'Version B' })).toBeInTheDocument();
    expect(within(day2).getByText('Yakitori under the tracks')).toBeInTheDocument();
    expect(within(day2).getByText('2 versions · not settled')).toBeInTheDocument();

    // And the screen's own head still states the trip's shape.
    expect(screen.getByText('7 days')).toBeInTheDocument();
    expect(screen.getByText('1 day split · not settled')).toBeInTheDocument();

    // With everything still waiting on the rail. Scoped to the rail: a title
    // here can also be a location on a day, and the seed has both.
    const rail = screen.getByRole('complementary', { name: 'Kept and not placed yet' });
    expect(within(rail).getByText('Not placed yet · 3')).toBeInTheDocument();
    expect(within(rail).getByText('Kiyamachi')).toBeInTheDocument();
    expect(within(rail).getByText('Nishiki market')).toBeInTheDocument();
    expect(within(rail).getByText('Coffee at Weekenders')).toBeInTheDocument();
  });

  it('takes every way of changing the itinerary away', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');
    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    await screen.findByRole('heading', { name: 'Version B' });

    // Everything done TO a day.
    expect(screen.queryByRole('button', { name: 'Fork this day' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add another' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Keep Version/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Swap Day/ })).not.toBeInTheDocument();

    // Everything that puts something on a day, or takes it off again.
    expect(screen.queryByRole('button', { name: '+ add to this day' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^\+ add to Version/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fill it' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /off this day$/ })).not.toBeInTheDocument();
    // The time column stops being a button — ItemLine's own readOnly, threaded.
    expect(screen.queryByRole('button', { name: /the hours for/ })).not.toBeInTheDocument();

    // Where you sleep, in both its states.
    expect(screen.queryByRole('button', { name: /^Where you sleep:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Say where you sleep' })).not.toBeInTheDocument();

    // The rail's two routes onto a day. dnd-kit does not care how a row is
    // styled, so the sensors are the real kill switch (see NO_SENSORS) — but
    // with the grip gone there is nothing left to lift either.
    expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add .+ to a day$/ })).not.toBeInTheDocument();

    // And the trip's dates.
    expect(screen.queryByRole('button', { name: 'Change dates' })).not.toBeInTheDocument();
  });

  // Folding the list is reading, not writing. None of it may be taken away
  // with the edits — a viewer on a fortnight's trip needs it most.
  it('keeps every way of reading the days', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');

    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getAllByRole('heading', { name: /^Day \d · / })).toHaveLength(7);

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByRole('heading', { name: /^Day \d · / })).not.toBeInTheDocument();

    // And one day on its own, opened and closed from its own chevron.
    await openDay(user, 'Day 1 · Mon 2');
    expect(screen.getAllByRole('heading', { name: /^Day \d · / })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Close Day 1 · Mon 2' }));
    expect(screen.queryByRole('heading', { name: /^Day \d · / })).not.toBeInTheDocument();
  });

  it('still discloses what was set aside, and offers no way to bring it back', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 3 · Wed 4');

    await user.click(screen.getByRole('button', { name: /Archived · 1/ }));

    expect(screen.getByText('Day 3 · Wed 4 · Version B')).toBeInTheDocument();
    expect(screen.getByText('09:00–09:30 · 1 thing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Bring back/ })).not.toBeInTheDocument();
  });

  it('tells the rail what it is, rather than naming controls a viewer has not got', async () => {
    renderItinerary();
    await screen.findByText('Not placed yet · 3');

    expect(screen.getByText('Kept for this trip, not on a day yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Drag one onto a day/)).not.toBeInTheDocument();
    // The one thing about this rail people assume wrongly is said to everyone.
    expect(screen.getByText(/Nothing here is used up/)).toBeInTheDocument();
  });

  // A viewer can never reach the gate by "Change dates" — it is not on their
  // header — so the gate they see is always the trip with no dates at all.
  it('says why there are no days, rather than handing over the date form', async () => {
    const trip = findEntry(SEEDED_TRIP_ID);
    if (trip) {
      trip.starts_on = null;
      trip.ends_on = null;
    }
    renderItinerary();

    expect(await screen.findByRole('heading', { level: 2, name: 'No days yet' })).toBeInTheDocument();
    expect(
      screen.getByText("The dates aren't set yet. Only someone editing this trip can open the days."),
    ).toBeInTheDocument();

    expect(screen.queryByLabelText('First day')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Last day')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open the days' })).not.toBeInTheDocument();
    // The warning modal is only ever reached by answering that form, and is
    // not mounted for a viewer either.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The way out stays.
    expect(screen.getByRole('button', { name: 'Back to ideas' })).toBeInTheDocument();
  });

  it('gives the whole screen back to a member', async () => {
    setRole(SEEDED_TRIP_ID, 1, 'member');
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');
    await openDay(user, 'Day 1 · Mon 2');

    expect(screen.getByRole('button', { name: 'Change dates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fork this day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drag Kiyamachi onto a day' })).toBeInTheDocument();
  });
});
