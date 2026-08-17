import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '../../components/Toast';
import { TripRoleProvider } from '../../auth/TripRoleContext';
import { api } from '../../api';
import type { Entry } from '../../api/types';
import { NewTodoForm } from './NewTodoForm';

const TRIP_ID = 7;
const TITLE = 'What needs doing?';
const BY_WHEN = 'By when for the new item';
const SUBMIT = 'Add this todo';
const CANCEL = 'Cancel this todo';

// Only the two fields the picker reads. The composer never looks at anything
// else on an entry, so a full fixture would just be furniture.
const ENTRIES = [
  { id: 21, title: 'Nanzen-ji' },
  { id: 22, title: 'Kiyomizu-dera' },
] as unknown as Entry[];

/**
 * One QueryClient per test, captured in a closure — building it inside the
 * wrapper component body would mint a fresh client on every re-render and reset
 * any mutation in flight.
 */
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

function renderForm(onClose: () => void = () => {}) {
  return render(<NewTodoForm tripId={TRIP_ID} entries={ENTRIES} onClose={onClose} />, {
    wrapper: makeWrapper(),
  });
}

/** A date input is filled in by the browser's own control, not by keystrokes. */
function pickDate(value: string) {
  fireEvent.change(screen.getByLabelText(BY_WHEN), { target: { value } });
}

/** The `todo` the first POST carried — what the composer actually asked for. */
function created(post: { mock: { calls: unknown[][] } }) {
  const [path, body] = post.mock.calls[0] as [string, { todo: Record<string, unknown> }];
  expect(path).toBe('/todos');
  return body.todo;
}

describe('NewTodoForm — writing the next thing on the list', () => {
  // Asking for the composer is asking to type in it.
  it('takes focus as soon as it appears', () => {
    renderForm();
    expect(screen.getByLabelText(TITLE)).toHaveFocus();
  });

  // The placeholder is the example; the label is the name. Both say the same
  // words here, which is only allowed because the words are a real question.
  it('labels the title with a real label, not just a placeholder', () => {
    renderForm();

    const title = screen.getByLabelText(TITLE);
    expect(title).toHaveAttribute('placeholder', TITLE);
    expect(screen.getByRole('textbox', { name: TITLE })).toBe(title);
  });

  it('will not submit an empty or whitespace-only title', async () => {
    const post = vi.spyOn(api, 'post');
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByRole('button', { name: SUBMIT })).toBeDisabled();

    await user.type(screen.getByLabelText(TITLE), '   ');
    expect(screen.getByRole('button', { name: SUBMIT })).toBeDisabled();

    await user.keyboard('{Enter}');
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('creates a general todo from a title alone, on Enter', async () => {
    const post = vi.spyOn(api, 'post');
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(TITLE), 'Apply for the visa{Enter}');

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    // No entry chosen means the todo belongs to the trip, and no by-when means
    // the field is left off the payload rather than sent as null.
    expect(created(post)).toEqual({ title: 'Apply for the visa', trip_id: TRIP_ID });
    post.mockRestore();
  });

  it('trims the title it saves', async () => {
    const post = vi.spyOn(api, 'post');
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(TITLE), '  Apply for the visa  {Enter}');

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(created(post)).toMatchObject({ title: 'Apply for the visa' });
    post.mockRestore();
  });

  /**
   * The bug this component was built for, at the level of the component: a
   * by-when set, and the submit reached without ever going back to the title.
   * The old add row had no submit to reach, so this path had no ending.
   */
  it('submits a todo with a by-when set, from the by-when itself', async () => {
    const post = vi.spyOn(api, 'post');
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(TITLE), 'Buy the JR regional pass');
    await user.click(screen.getByRole('button', { name: BY_WHEN }));
    pickDate('2026-09-20');
    await user.keyboard('{Enter}');

    // Focus is on the by-when chip, which is exactly where the old row ran out
    // of ways to save.
    expect(screen.getByRole('button', { name: BY_WHEN })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: SUBMIT }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(created(post)).toEqual({
      title: 'Buy the JR regional pass',
      trip_id: TRIP_ID,
      due_on: '2026-09-20',
    });
    post.mockRestore();
  });

  it('hangs the todo off the idea chosen in the For picker', async () => {
    const post = vi.spyOn(api, 'post');
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(TITLE), 'Check opening hours');
    await user.selectOptions(screen.getByRole('combobox', { name: 'For' }), '21');
    await user.click(screen.getByRole('button', { name: SUBMIT }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    // entry_id instead of trip_id, never both — the API takes one owner.
    expect(created(post)).toEqual({ title: 'Check opening hours', entry_id: 21 });
    post.mockRestore();
  });
});

describe('NewTodoForm — a list is written in bursts', () => {
  it('stays open after a create, empty and ready for the next thing', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderForm(onClose);

    await user.type(screen.getByLabelText(TITLE), 'Apply for the visa');
    await user.selectOptions(screen.getByRole('combobox', { name: 'For' }), '21');
    await user.click(screen.getByRole('button', { name: BY_WHEN }));
    pickDate('2026-09-20');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: SUBMIT }));

    await waitFor(() => expect(screen.getByLabelText(TITLE)).toHaveValue(''));
    // Not put away — the next item is the likeliest next act.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(TITLE)).toHaveFocus();
    // Both settings belonged to the item that just left. The by-when is the one
    // that would hurt if it stuck: it would land silently on everything after.
    expect(screen.getByRole('combobox', { name: 'For' })).toHaveValue('');
    expect(screen.getByRole('button', { name: BY_WHEN })).toHaveTextContent('+ By when?');
  });

  it('keeps everything typed when the create fails, and says so', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(TITLE), 'Apply for the visa{Enter}');

    expect(await screen.findByText("That didn't save. It's still here — try again.")).toBeInTheDocument();
    expect(screen.getByLabelText(TITLE)).toHaveValue('Apply for the visa');
    post.mockRestore();
  });
});

describe('NewTodoForm — the ways out', () => {
  it('puts the composer away on the cancel control, keeping nothing', async () => {
    const post = vi.spyOn(api, 'post');
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderForm(onClose);

    await user.type(screen.getByLabelText(TITLE), 'Half a thought');
    await user.click(screen.getByRole('button', { name: CANCEL }));

    expect(onClose).toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('puts the composer away on Escape', async () => {
    const post = vi.spyOn(api, 'post');
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderForm(onClose);

    await user.type(screen.getByLabelText(TITLE), 'Half a thought{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });

  /**
   * Two things listen for Escape here and only the inner one may answer.
   * DeadlineField stops the event at the picker, so an escaped date closes the
   * date and leaves the half-written todo exactly where it was.
   */
  it('lets Escape in the by-when picker close only the picker', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderForm(onClose);

    await user.type(screen.getByLabelText(TITLE), 'Buy the JR regional pass');
    await user.click(screen.getByRole('button', { name: BY_WHEN }));
    pickDate('2026-09-20');
    await user.keyboard('{Escape}');

    // The picker is closed and took its unfinished date with it. Queried by type
    // rather than by name: open or closed, the control answers to the same
    // accessible name, so only the tag says which of the two is on the page.
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByRole('button', { name: BY_WHEN })).toHaveTextContent('+ By when?');
    // And the composer is still standing, with the title still in it.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(TITLE)).toHaveValue('Buy the JR regional pass');
  });

  // A viewer never reaches this — the checklist's trigger is behind the same
  // check — but a create surface refuses on its own account rather than trusting
  // its caller. Same call as NewBundleForm and the two modals.
  it('does not render for a viewer', () => {
    render(
      <TripRoleProvider role="viewer">
        <NewTodoForm tripId={TRIP_ID} entries={ENTRIES} onClose={() => {}} />
      </TripRoleProvider>,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByLabelText(TITLE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SUBMIT })).not.toBeInTheDocument();
  });
});
