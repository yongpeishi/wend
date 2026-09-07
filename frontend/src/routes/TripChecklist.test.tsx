import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { server } from '../mocks/server';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { allocateId, db, setRole } from '../mocks/db';
import { TripChecklist } from './TripChecklist';
import styles from './TripChecklist.module.css';
import type { Todo, TripRole } from '../api/types';

// The checklist reads `trip` from useOutletContext, which only exists inside an
// <Outlet> — routed through a stand-in layout, the same shape TripLayout gives.
function TestTripLayout() {
  return <Outlet context={{ trip: { id: 1, title: 'Six days in Kyoto' } }} />;
}

/** `role` mounts the provider TripLayout mounts in the app. Omitted, there is
 * no provider and the context hands back its editable default. */
function renderChecklist(role?: TripRole) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const checklist = (
    <MemoryRouter initialEntries={['/trips/1/checklist']}>
      <Routes>
        <Route path="/trips/:id" element={<TestTripLayout />}>
          <Route path="checklist" element={<TripChecklist />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {role ? <TripRoleProvider role={role}>{checklist}</TripRoleProvider> : checklist}
      </ToastProvider>
    </QueryClientProvider>,
  );
}

// Seeded trip 1 (src/mocks/db.ts) carries two open todos: one hanging off
// Nanzen-ji, one on the trip itself.
const TRIP_ID = 1;
const ENTRY_TODO = 'Check opening hours';
const TRIP_TODO = 'Apply for visa';

const ADD_TRIGGER = '+ Add a todo';

/** The composer is behind one control now, so a test about it starts by asking. */
async function openComposer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: ADD_TRIGGER }));
  return screen.getByRole('textbox', { name: 'What needs doing?' });
}

async function markDone(title: string) {
  const { todos } = await api.get<{ todos: Todo[] }>('/todos', { params: { trip_id: TRIP_ID } });
  const todo = todos.find((t) => t.title === title);
  if (!todo) throw new Error(`No seeded todo called ${title}`);
  await api.patch(`/todos/${todo.id}`, { todo: { done_at: new Date().toISOString() } });
}

describe('TripChecklist', () => {
  it('lists what the trip still needs, and offers a way to add to it', async () => {
    renderChecklist();

    expect(await screen.findByText(TRIP_TODO)).toBeInTheDocument();
    expect(screen.getByText(ENTRY_TODO)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ADD_TRIGGER })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Check off ${TRIP_TODO}` })).toBeInTheDocument();
  });

  // The page opens as a list, not as a form. The composer is one click away and
  // takes the keyboard the moment it arrives, so asking for it and being ready
  // to type in it are the same act.
  it('keeps the composer out of the way until it is asked for', async () => {
    const user = userEvent.setup();
    renderChecklist();
    await screen.findByText(TRIP_TODO);

    expect(screen.queryByRole('textbox', { name: 'What needs doing?' })).not.toBeInTheDocument();

    expect(await openComposer(user)).toHaveFocus();
    expect(screen.queryByRole('button', { name: ADD_TRIGGER })).not.toBeInTheDocument();
  });

  it('says how many things are still to do', async () => {
    renderChecklist();

    expect(await screen.findByRole('heading', { name: 'Todo · 2' })).toBeInTheDocument();
  });

  it('offers a new item the whole trip rather than one idea, in plain words', async () => {
    const user = userEvent.setup();
    renderChecklist();
    await screen.findByText(TRIP_TODO);
    await openComposer(user);

    const forSelect = screen.getByRole('combobox', { name: 'For' });
    expect(forSelect).toHaveValue('');
    expect(screen.getByRole('option', { name: 'In general' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'the whole trip' })).not.toBeInTheDocument();
  });

  it('asks by when for a new item, alongside what it is for', async () => {
    const user = userEvent.setup();
    renderChecklist();
    await screen.findByText(TRIP_TODO);
    await openComposer(user);

    expect(
      screen.getByRole('button', { name: 'By when for the new item' }),
    ).toHaveTextContent('+ By when?');
  });

  it('puts a deadline on a line that had none once you leave the field, and keeps it', async () => {
    const user = userEvent.setup();
    renderChecklist();
    await screen.findByText(ENTRY_TODO);

    await user.click(screen.getByRole('button', { name: `By when for ${ENTRY_TODO}` }));
    // A date input is filled in by the browser's own control, not by keystrokes.
    // Its `change` only drafts — a half-typed date fires one too — so it is
    // leaving the field that saves.
    fireEvent.change(screen.getByLabelText(`By when for ${ENTRY_TODO}`), {
      target: { value: '2026-11-05' },
    });
    fireEvent.blur(screen.getByLabelText(`By when for ${ENTRY_TODO}`));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: `By when for ${ENTRY_TODO}` })).toHaveTextContent(
        'by 5 Nov',
      ),
    );
  });

  it('shows the deadline a line already has, and sorts that line to the top', async () => {
    renderChecklist();
    await screen.findByText(TRIP_TODO);

    expect(screen.getByRole('button', { name: `By when for ${TRIP_TODO}` })).toHaveTextContent(
      'by 1 Oct',
    );
    // Seeded dated (1 Oct) before seeded undated — sortOpenTodos' ordering,
    // arriving on the page.
    const titles = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(titles[0]).toContain(TRIP_TODO);
    expect(titles[1]).toContain(ENTRY_TODO);
  });

  /**
   * The reported bug, walked the way it was reported: "adding deadline doesn't
   * work. I cannot submit new todo with deadline."
   *
   * The old add row's only route to a create was an Enter keydown on the title
   * field. Set a deadline and focus is on the by-when trigger, where Enter
   * re-opens the picker, and Enter inside the picker commits the day and hands
   * focus straight back to that trigger — so the create was reachable only by
   * knowing to click back into the title first, and on a phone not at all. This
   * test never goes back, which is why it failed before the composer existed.
   */
  it('saves a new item that has a by-when, without going back to the title first', async () => {
    const post = vi.spyOn(api, 'post');
    const user = userEvent.setup();
    renderChecklist();
    await screen.findByText(TRIP_TODO);

    await user.type(await openComposer(user), 'Buy the JR regional pass');

    await user.click(screen.getByRole('button', { name: 'By when for the new item' }));
    fireEvent.change(screen.getByLabelText('By when for the new item'), {
      target: { value: '2026-09-20' },
    });
    await user.keyboard('{Enter}');

    // Enter in the picker ends the date and nothing else — it is not the form's
    // submit. Focus is on the by-when chip now, and the composer is still open.
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'By when for the new item' })).toHaveTextContent(
      'by 20 Sep',
    );

    await user.click(screen.getByRole('button', { name: 'Add this todo' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [path, body] = post.mock.calls[0] as [string, unknown];
    expect(path).toBe('/todos');
    expect(body).toEqual({
      todo: { title: 'Buy the JR regional pass', trip_id: TRIP_ID, due_on: '2026-09-20' },
    });
    expect(await screen.findByText('Buy the JR regional pass')).toBeInTheDocument();
    post.mockRestore();
  });
});

/**
 * Written in two halves on purpose: the first asserts the affordances are gone,
 * the second asserts the checklist is still all there. A test with only the
 * first half passes on a blank page, which is the one outcome read-only mode
 * must never produce.
 */
describe('TripChecklist — as a viewer', () => {
  beforeEach(async () => {
    // Signed in and genuinely a viewer in the fixtures, not merely told to
    // render as one.
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    setRole(TRIP_ID, 1, 'viewer');
  });

  it('takes away adding and checking off', async () => {
    renderChecklist('viewer');
    await screen.findByText(TRIP_TODO);

    // The composer goes whole, trigger included — an empty field is a control,
    // not something to read, so there is nothing here to leave readOnly.
    expect(screen.queryByRole('button', { name: ADD_TRIGGER })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'What needs doing?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'For' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Check off ${TRIP_TODO}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Check off ${ENTRY_TODO}` })).not.toBeInTheDocument();
  });

  it('leaves deadlines as something to read rather than something to set', async () => {
    renderChecklist('viewer');
    await screen.findByText(TRIP_TODO);

    // The dated line still says when — as text.
    expect(screen.getByText('by 1 Oct')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `By when for ${TRIP_TODO}` })).not.toBeInTheDocument();
    // And the undated line says nothing at all, rather than inviting one.
    expect(screen.queryByRole('button', { name: `By when for ${ENTRY_TODO}` })).not.toBeInTheDocument();
    expect(screen.queryByText('+ By when?')).not.toBeInTheDocument();
  });

  it('still shows every line, and still says where each one stands', async () => {
    renderChecklist('viewer');

    expect(await screen.findByText(TRIP_TODO)).toBeInTheDocument();
    expect(screen.getByText(ENTRY_TODO)).toBeInTheDocument();
    // The meta a checklist is read for: which idea, and by when.
    expect(screen.getByText(/Nanzen-ji/)).toBeInTheDocument();
    expect(screen.getByText('by 1 Oct')).toBeInTheDocument();
    // The circle stays and stops being a button, so the state is still drawn —
    // and still spelled out for a screen reader.
    expect(screen.getAllByText('Still to do')).toHaveLength(2);
  });

  it('keeps the done section, which is reading rather than editing', async () => {
    const user = userEvent.setup();
    await markDone(TRIP_TODO);
    renderChecklist('viewer');
    await screen.findByText(ENTRY_TODO);

    await user.click(await screen.findByRole('button', { name: 'Done · 1' }));

    expect(screen.getByText(TRIP_TODO)).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('gives the whole checklist back to an owner', async () => {
    const user = userEvent.setup();
    setRole(TRIP_ID, 1, 'owner');
    renderChecklist('owner');
    await screen.findByText(TRIP_TODO);

    expect(screen.getByRole('button', { name: `Check off ${TRIP_TODO}` })).toBeInTheDocument();
    await openComposer(user);
    expect(screen.getByRole('combobox', { name: 'For' })).toBeInTheDocument();
  });
});

/**
 * Feedback #40, "Todo text should wrap." Whether a title actually breaks onto
 * a second line is layout, and jsdom does no layout — so none of this proves
 * wrapping. What it can prove is the two things that would stop wrapping from
 * happening: a title that is cut (not rendered in full) or a title whose
 * styling truncates (nowrap / ellipsis / hidden). vitest runs with `css: true`
 * (vitest.config.ts), which gives the module's real class names and injects
 * its rules into the document; jsdom's getComputedStyle applies the cascade
 * for declared values, so the `.source` control below checks that the rules
 * really arrived before the title's absences are taken to mean anything.
 */
describe('TripChecklist — long titles', () => {
  // ~120 characters of prose: breaks at its spaces, given the room.
  const PROSE_TITLE =
    'Ring the ryokan in Arashiyama to confirm the late check-in on the second night and ask whether the kaiseki dinner can be vegetarian';
  // ~140 characters with no space anywhere: cannot break at all without help.
  const URL_TITLE =
    'https://www.japan-guide.com/e/e3900.html?utm_source=itinerary&utm_medium=checklist&utm_campaign=kyoto-six-days&ref=nanzenji-opening-hours-and-fees';

  beforeEach(() => {
    // Trip-level, like the seeded "Apply for visa" — no idea name beside them,
    // so the title is the only text in its cell. resetDb() in afterEach takes
    // them out again.
    db.todos.push(
      { id: allocateId(), title: PROSE_TITLE, entry_id: null, trip_id: TRIP_ID, done_at: null, due_on: null, position: 1 },
      { id: allocateId(), title: URL_TITLE, entry_id: null, trip_id: TRIP_ID, done_at: null, due_on: null, position: 2 },
    );
  });

  /** The declared-style checks, shared by both shapes of title. */
  function expectRenderedInFullAndUntruncated(title: string, el: HTMLElement) {
    expect(el.textContent).toBe(title);
    expect(el).toHaveClass(styles.title);
    expect(screen.getAllByRole('listitem')).toContain(el.closest('li'));

    const style = getComputedStyle(el);
    expect(style.whiteSpace).not.toBe('nowrap');
    expect(style.textOverflow).not.toBe('ellipsis');
    expect(style.overflow).not.toBe('hidden');
  }

  it('renders a long prose title in full, in its own list item, with nothing in its styling that truncates', async () => {
    renderChecklist();

    expectRenderedInFullAndUntruncated(PROSE_TITLE, await screen.findByText(PROSE_TITLE));
  });

  /**
   * Since feedback #42 this title is a link rather than a run of text, so "in
   * full" has moved: the whole 148-character address is in the href and in the
   * anchor's title, and the visible label is deliberately middle-truncated so
   * one pasted URL cannot set the row's width on its own. What has not moved is
   * where it lands — the same title cell, in its own list item — or the absence
   * of anything in that cell's styling that truncates, which is what feedback
   * #40 was about and is still the thing this asserts.
   */
  it('renders an unbroken URL-like title as one link, whole in the href, with nothing in its styling that truncates', async () => {
    renderChecklist();

    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', URL_TITLE);
    expect(link).toHaveAttribute('title', URL_TITLE);
    expect(link.textContent).toHaveLength(48);

    const cell = link.parentElement as HTMLElement;
    expect(cell).toHaveClass(styles.title);
    expect(screen.getAllByRole('listitem')).toContain(cell.closest('li'));

    const style = getComputedStyle(cell);
    expect(style.whiteSpace).not.toBe('nowrap');
    expect(style.textOverflow).not.toBe('ellipsis');
    expect(style.overflow).not.toBe('hidden');
  });

  // The one cell on the row that is meant to ellipsise is the idea name. This
  // pins the title to a different element from it, so a refactor that folded
  // the two into one cell would put the title under .source's nowrap and fail
  // here — and, as the control for the checks above, confirms the module's
  // rules are in the cascade jsdom reads from.
  it('keeps the title and the idea name in separate cells, and only the idea name is styled to ellipsise', async () => {
    renderChecklist();

    const entryTitle = await screen.findByText(ENTRY_TODO);
    const source = screen.getByText(/Nanzen-ji/);

    expect(entryTitle).toHaveClass(styles.title);
    expect(source).toHaveClass(styles.source);
    expect(source).not.toBe(entryTitle);
    expect(source.contains(entryTitle)).toBe(false);
    expect(entryTitle.contains(source)).toBe(false);

    expect(getComputedStyle(source).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(source).textOverflow).toBe('ellipsis');
    expect(getComputedStyle(entryTitle).whiteSpace).not.toBe('nowrap');
  });
});

/**
 * Feedback #42, in the words it was reported: "when entered a url, it should be
 * displayed as clickable link, which should open in new tab when clicked. Eg: in
 * todo item". A todo is where the booking page gets pasted, so it is the surface
 * the reporter will check first.
 */
describe('TripChecklist — a URL in a todo', () => {
  const BOOKING = 'https://jr-central.example/booking';
  const WITH_URL = `Book the shinkansen at ${BOOKING} before Friday`;
  const NO_URL = 'Pack the umbrella';

  beforeEach(() => {
    // Trip-level, like the seeded "Apply for visa". resetDb() in afterEach takes
    // them out again.
    db.todos.push(
      { id: allocateId(), title: WITH_URL, entry_id: null, trip_id: TRIP_ID, done_at: null, due_on: null, position: 1 },
      { id: allocateId(), title: NO_URL, entry_id: null, trip_id: TRIP_ID, done_at: null, due_on: null, position: 2 },
    );
  });

  it('makes the URL a link that opens in a new tab, leaving the sentence around it alone', async () => {
    renderChecklist();

    const link = await screen.findByRole('link', { name: BOOKING });
    expect(link).toHaveAttribute('href', BOOKING);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    // Still the line that was typed, word for word, in the cell it always was.
    const cell = link.parentElement as HTMLElement;
    expect(cell).toHaveClass(styles.title);
    expect(cell.textContent).toBe(WITH_URL);
  });

  /**
   * The reporter's own next move: click the link. The circle is a sibling of the
   * title rather than an ancestor, and the anchor stops the click besides — so
   * following a link must not tick the thing off, and must not send anything.
   */
  it('does not check the todo off when the link inside it is clicked', async () => {
    const patch = vi.spyOn(api, 'patch');
    const user = userEvent.setup();
    renderChecklist();

    await user.click(await screen.findByRole('link', { name: BOOKING }));

    expect(patch).not.toHaveBeenCalled();
    // Still offering to check it off, and still saying it is not checked off.
    expect(screen.getByRole('button', { name: `Check off ${WITH_URL}` })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    patch.mockRestore();
  });

  /** The raw title is what a screen reader hears and what the deadline names,
   * on both rows — a link is a thing to look at, not a thing to say. */
  it('keeps the raw title in the labels, links and all', async () => {
    renderChecklist();
    await screen.findByRole('link', { name: BOOKING });

    expect(screen.getByRole('button', { name: `Check off ${WITH_URL}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `By when for ${WITH_URL}` })).toBeInTheDocument();
  });

  it('leaves a todo with no URL in it exactly as it was — no anchor, no wrapper', async () => {
    renderChecklist();

    const cell = await screen.findByText(NO_URL);
    expect(cell).toHaveClass(styles.title);
    expect(cell.querySelector('*')).toBeNull();
    expect(cell.childNodes).toHaveLength(1);
  });
});

/** A failed load is not a finished checklist — "Nothing to check off" must
 * never stand in for todos the screen simply could not fetch. */
describe('TripChecklist — when the load fails', () => {
  it('says the load failed instead of claiming the list is clear, and offers a way back', async () => {
    server.use(http.get('/api/todos', () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    renderChecklist();

    expect(
      await screen.findByText("Your checklist didn't load. Nothing is lost — everything on it is still there."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText(/Nothing to check off/)).not.toBeInTheDocument();
    // The composer waits with the rest of the screen, same as while loading.
    expect(screen.queryByRole('button', { name: ADD_TRIGGER })).not.toBeInTheDocument();
  });
});
