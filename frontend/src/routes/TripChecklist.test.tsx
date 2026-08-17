import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { setRole } from '../mocks/db';
import { TripChecklist } from './TripChecklist';
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
