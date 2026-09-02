import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { api } from '../../api';
import { allocateId, db } from '../../mocks/db';
import { IdeaTodos } from './IdeaTodos';
import styles from './IdeaTodos.module.css';

const ENTRY_ID = 4001;
const OTHER_ENTRY_ID = 4002;
const ADD_LABEL = 'Add a to-do';

/**
 * Two to-dos on our idea and one on the idea next door. The third is the whole
 * point of the fixture: `GET /api/todos?entry_id=` filters server-side, and the
 * only way to catch a component that dropped the filter is to give it something
 * it could wrongly show.
 */
beforeEach(() => {
  db.todos.push(
    { id: allocateId(), title: 'Book tickets', entry_id: ENTRY_ID, trip_id: null, done_at: null, due_on: null, position: 0 },
    { id: allocateId(), title: 'Check opening hours', entry_id: ENTRY_ID, trip_id: null, done_at: '2026-08-01T09:00:00Z', due_on: null, position: 1 },
    { id: allocateId(), title: 'Somebody else’s errand', entry_id: OTHER_ENTRY_ID, trip_id: null, done_at: null, due_on: null, position: 0 },
  );
});

function renderTodos(canEdit?: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <IdeaTodos entryId={ENTRY_ID} canEdit={canEdit} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** The `todo` the nth call carried — what the block actually asked the API for. */
function payload(spy: { mock: { calls: unknown[][] } }, call = 0) {
  const [, body] = spy.mock.calls[call] as [string, { todo: Record<string, unknown> }];
  return body.todo;
}

describe('IdeaTodos — what the expanded row shows', () => {
  it('lists this idea’s to-dos and nobody else’s', async () => {
    renderTodos();

    expect(await screen.findByText('Book tickets')).toBeInTheDocument();
    expect(screen.getByText('Check opening hours')).toBeInTheDocument();
    expect(screen.queryByText('Somebody else’s errand')).not.toBeInTheDocument();
  });

  it('names the block, and says which ones are already done', async () => {
    renderTodos();

    expect(screen.getByText('To-do')).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: 'Book tickets' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Check opening hours' })).toBeChecked();
  });

  // A spinner in a 30px strip inside an already-open panel is noise, but the
  // block must not grow into place either — the add row is there from the start.
  it('shows no spinner while the list is loading, and keeps the add row in place', () => {
    renderTodos();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText(ADD_LABEL)).toBeInTheDocument();
  });

  it('says so in one line when the to-dos cannot be fetched', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'));
    renderTodos();

    expect(await screen.findByText('Your to-dos didn’t load.')).toBeInTheDocument();
    get.mockRestore();
  });

  // The add row is the empty state. A paragraph saying "no to-dos yet" above a
  // field that already says "+ to-do" is the same sentence twice.
  it('offers no empty-state paragraph when there is nothing on the list', async () => {
    db.todos = db.todos.filter((todo) => todo.entry_id !== ENTRY_ID);
    renderTodos();

    await waitFor(() => expect(screen.getByLabelText(ADD_LABEL)).toBeInTheDocument());
    expect(screen.queryByText(/no to-dos|nothing/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('IdeaTodos — ticking things off', () => {
  it('marks an open to-do done, and the row reads as done afterwards', async () => {
    const patch = vi.spyOn(api, 'patch');
    const user = userEvent.setup();
    renderTodos();

    await user.click(await screen.findByRole('checkbox', { name: 'Book tickets' }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(payload(patch).done_at).toEqual(expect.any(String));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Book tickets' })).toBeChecked(),
    );
    patch.mockRestore();
  });

  // Unticking is not "undo" — it is the same control saying the other thing, so
  // it has to send an explicit null rather than omitting the field.
  it('puts a done to-do back on the list with an explicit null', async () => {
    const patch = vi.spyOn(api, 'patch');
    const user = userEvent.setup();
    renderTodos();

    await user.click(await screen.findByRole('checkbox', { name: 'Check opening hours' }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(payload(patch)).toEqual({ done_at: null });
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Check opening hours' })).not.toBeChecked(),
    );
    patch.mockRestore();
  });
});

describe('IdeaTodos — adding one', () => {
  it('takes a title on Enter and hands the field back empty', async () => {
    const post = vi.spyOn(api, 'post');
    const user = userEvent.setup();
    renderTodos();

    await user.type(screen.getByLabelText(ADD_LABEL), 'Reserve the ryokan{Enter}');

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(payload(post)).toEqual({ title: 'Reserve the ryokan', entry_id: ENTRY_ID });
    await waitFor(() => expect(screen.getByLabelText(ADD_LABEL)).toHaveValue(''));
    expect(await screen.findByText('Reserve the ryokan')).toBeInTheDocument();
    post.mockRestore();
  });

  it('names the field for a screen reader and shows the example as the placeholder', () => {
    renderTodos();

    expect(screen.getByLabelText(ADD_LABEL)).toHaveAttribute(
      'placeholder',
      '+ to-do (book, reserve, buy...)',
    );
  });

  it('sends nothing at all for a blank or whitespace-only title', async () => {
    const post = vi.spyOn(api, 'post');
    const user = userEvent.setup();
    renderTodos();

    const field = screen.getByLabelText(ADD_LABEL);
    await user.type(field, '{Enter}');
    await user.type(field, '   {Enter}');

    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('keeps the words and says so when the create fails', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderTodos();

    await user.type(screen.getByLabelText(ADD_LABEL), 'Reserve the ryokan{Enter}');

    expect(
      await screen.findByText("That didn't save. It's still here — try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(ADD_LABEL)).toHaveValue('Reserve the ryokan');
    post.mockRestore();
  });
});

/**
 * Feedback #40: a long to-do title must wrap, not truncate or push the row wide.
 *
 * What jsdom can and cannot prove here. Vitest processes the module
 * (`css: true`, vitest.config.ts) and jsdom's getComputedStyle copies the
 * declared properties of matching stylesheet rules onto the element, so the
 * checks below see the real rules: `overflow-wrap: anywhere` and `min-width: 0`
 * on the title, `align-items: flex-start` on the line, and no `nowrap` /
 * `ellipsis` / `overflow: hidden` on either. What jsdom does not do is layout —
 * nothing here measures that the text actually breaks across lines or that the
 * row stays inside the card; that is a browser's to show. The class check pins
 * the span to the rule that carries the wrap, so a swapped class is caught even
 * if the declarations move.
 */
describe('IdeaTodos — long titles', () => {
  const PROSE =
    'Book the 7:40 shinkansen from Tokyo to Kyoto for all four of us, reserved seats on the left side for the Fuji view, and print the tickets';
  const URL =
    'https://reservations.example-rail.co.jp/booking/confirm?journey=tokyo-kyoto&date=2026-10-12&depart=0740&seats=4&side=left&class=reserved&ref=WEND';

  /** The `<span>` that names the checkbox — the element the wrap rule sits on. */
  function titleAndLine(title: string) {
    const box = screen.getByRole('checkbox', { name: title });
    const span = screen.getByText(title);
    expect(span.tagName).toBe('SPAN');
    expect(box.getAttribute('aria-labelledby')).toBe(span.id);
    const li = span.closest('li');
    expect(li).not.toBeNull();
    return { span, li: li as HTMLLIElement };
  }

  /** No truncation styling on the element: not a nowrap, not an ellipsis, not clipped. */
  function expectNoTruncation(el: HTMLElement) {
    const computed = getComputedStyle(el);
    expect(computed.whiteSpace).not.toBe('nowrap');
    expect(computed.textOverflow).not.toBe('ellipsis');
    expect(computed.overflow).not.toBe('hidden');
  }

  /** The declarations that make a wrap possible, on the elements that carry them. */
  function expectWrapRules(span: HTMLElement, li: HTMLElement) {
    expect(span).toHaveClass(styles.title);
    const title = getComputedStyle(span);
    expect(title.overflowWrap).toBe('anywhere');
    // jsdom returns the declared text unnormalised ('0'), a browser says '0px'.
    expect(title.minWidth).toMatch(/^0(px)?$/);
    expect(getComputedStyle(li).alignItems).toBe('flex-start');
  }

  it('renders a ~120-character prose title in full as the checkbox label, with the wrap rules and no truncation styling', async () => {
    expect(PROSE.length).toBeGreaterThanOrEqual(120);
    db.todos.push({ id: allocateId(), title: PROSE, entry_id: ENTRY_ID, trip_id: null, done_at: null, due_on: null, position: 2 });
    renderTodos();

    const span = await screen.findByText(PROSE);
    expect(span.textContent).toBe(PROSE);
    const { li } = titleAndLine(PROSE);

    expectWrapRules(span, li);
    expectNoTruncation(span);
    expectNoTruncation(li);
  });

  it('renders a 140-character unbroken URL in full as the checkbox label, with the wrap rules and no truncation styling', async () => {
    expect(URL).not.toMatch(/\s/);
    expect(URL.length).toBeGreaterThanOrEqual(140);
    db.todos.push({ id: allocateId(), title: URL, entry_id: ENTRY_ID, trip_id: null, done_at: null, due_on: null, position: 2 });
    renderTodos();

    const span = await screen.findByText(URL);
    expect(span.textContent).toBe(URL);
    const { li } = titleAndLine(URL);

    expectWrapRules(span, li);
    expectNoTruncation(span);
    expectNoTruncation(li);
  });
});

describe('IdeaTodos — a viewer', () => {
  it('reads the list without being offered a control it cannot use', async () => {
    renderTodos(false);

    expect(await screen.findByText('Book tickets')).toBeInTheDocument();
    expect(screen.getByText('Check opening hours')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(ADD_LABEL)).not.toBeInTheDocument();
  });

  // The box is the only place a line says whether the thing is done, so a
  // viewer keeps the mark — as an image with the state spelled out, not a
  // greyed-out button.
  it('still says which ones are done', async () => {
    renderTodos(false);

    expect(await screen.findByRole('img', { name: 'Not done' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Done' })).toBeInTheDocument();
  });
});
