import { beforeEach, describe, expect, it } from 'vitest';
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
    expect(screen.getByRole('textbox', { name: 'What needs doing?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Check off ${TRIP_TODO}` })).toBeInTheDocument();
  });

  it('says how many things are still to do', async () => {
    renderChecklist();

    expect(await screen.findByRole('heading', { name: 'Todo · 2' })).toBeInTheDocument();
  });

  it('offers a new item the whole trip rather than one idea, in plain words', async () => {
    renderChecklist();
    await screen.findByText(TRIP_TODO);

    const forSelect = screen.getByRole('combobox', { name: 'For' });
    expect(forSelect).toHaveValue('');
    expect(screen.getByRole('option', { name: 'In general' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'the whole trip' })).not.toBeInTheDocument();
  });

  it('asks by when for a new item, alongside what it is for', async () => {
    renderChecklist();
    await screen.findByText(TRIP_TODO);

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

    // The add row goes whole — an empty field is a control, not something to
    // read, so there is nothing here to leave readOnly.
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
    setRole(TRIP_ID, 1, 'owner');
    renderChecklist('owner');
    await screen.findByText(TRIP_TODO);

    expect(screen.getByRole('textbox', { name: 'What needs doing?' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'For' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Check off ${TRIP_TODO}` })).toBeInTheDocument();
  });
});
