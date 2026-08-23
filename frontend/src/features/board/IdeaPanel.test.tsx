import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { ToastProvider } from '../../components/Toast';
import { IdeaPanel } from './IdeaPanel';
import { server } from '../../mocks/server';
import type { Entry } from '../../api/types';

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 42,
    kind: 'idea',
    title: 'Fushimi Inari',
    description: null,
    category: 'place',
    starts_on: null,
    ends_on: null,
    address: null,
    lat: null,
    lng: null,
    duration_minutes: 120,
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
    vote_tally: { total: 4, count: 2, average: 2 },
    my_vote: 2,
    scheduled: false,
    ...overrides,
  };
}

interface PanelOptions {
  entry?: Entry;
  canEdit?: boolean;
  actions?: ReactNode;
  id?: string;
}

function renderPanel(options: PanelOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <IdeaPanel
          entry={options.entry ?? makeEntry({})}
          canEdit={options.canEdit ?? true}
          actions={options.actions}
          id={options.id}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/**
 * The reading half of an open idea, shared by the board row and the map's pin
 * card: the idea's own words, the ballot, the to-dos — and a slot for whatever
 * the screen showing it can do about the idea.
 */
describe('IdeaPanel — the idea’s own words', () => {
  it('shows the description and the notes, both, when the idea has them', () => {
    renderPanel({
      entry: makeEntry({ description: 'Thousand torii gates up the hill.', notes: 'Go before eight.' }),
    });

    expect(screen.getByText('Thousand torii gates up the hill.')).toBeInTheDocument();
    expect(screen.getByText('Go before eight.')).toBeInTheDocument();
  });

  it('shows the address when there is one', () => {
    renderPanel({ entry: makeEntry({ address: '68 Fukakusa Yabunouchicho' }) });

    expect(screen.getByText('68 Fukakusa Yabunouchicho')).toBeInTheDocument();
  });

  // An idea kept as a bare name is the common case at capture time; the panel
  // must not draw empty paragraphs waiting to be filled.
  it('says nothing where the idea says nothing', () => {
    const { container } = renderPanel({
      entry: makeEntry({ description: null, notes: null, address: null }),
      id: 'panel-7',
    });

    // Only the panel's OWN paragraphs — the vote bar and the to-do block write
    // plenty of their own, and they are not what is being asked about here.
    const panel = container.querySelector('#panel-7') as HTMLElement;
    expect([...panel.children].filter((child) => child.tagName === 'P')).toHaveLength(0);
  });

  it('names itself when a disclosure needs something to point aria-controls at', () => {
    renderPanel({ id: 'panel-7' });

    expect(document.getElementById('panel-7')).toBeInTheDocument();
  });
});

describe('IdeaPanel — the ballot and the to-dos', () => {
  it('carries the vote bar, marked with the vote already cast', () => {
    renderPanel();

    expect(
      screen.getByRole('radiogroup', { name: 'How keen are you on Fushimi Inari?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Really keen' })).toHaveAttribute('aria-checked', 'true');
  });

  // The wiring lives in the panel, so a screen that shows it gets working votes
  // without knowing there is a mutation involved.
  it('puts the score that was picked, at the entry it belongs to', async () => {
    const sent: unknown[] = [];
    server.use(
      http.put('/api/entries/42/vote', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({
          vote: { id: 9, entry_id: 42, user_id: 1, user_name: 'Demo Traveler', score: -1 },
          tally: { total: -2, count: 2, average: -1 },
        });
      }),
    );
    renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Not keen' }));

    await waitFor(() => expect(sent).toEqual([{ score: -1 }]));
  });

  it('says the house sentence when the vote does not save', async () => {
    server.use(
      http.put('/api/entries/42/vote', () => HttpResponse.json({ error: 'no' }, { status: 500 })),
    );
    renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Neutral' }));

    expect(await screen.findByText("That didn't save. It's still here — try again.")).toBeInTheDocument();
  });

  it('gives a viewer the result and no ballot to fill in', () => {
    renderPanel({ canEdit: false });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('lists the idea’s to-dos', async () => {
    server.use(
      http.get('/api/todos', () =>
        HttpResponse.json({ todos: [{ id: 7, entry_id: 42, title: 'Book the tea house', done_at: null }] }),
      ),
    );
    renderPanel();

    expect(await screen.findByText('Book the tea house')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a to-do')).toBeInTheDocument();
  });

  it('gives a viewer the to-dos to read without the add row', async () => {
    server.use(
      http.get('/api/todos', () =>
        HttpResponse.json({ todos: [{ id: 7, entry_id: 42, title: 'Book the tea house', done_at: null }] }),
      ),
    );
    renderPanel({ canEdit: false });

    expect(await screen.findByText('Book the tea house')).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a to-do')).not.toBeInTheDocument();
  });
});

/**
 * The verbs are the screen's, not the panel's — the board offers four and hangs
 * a composer under them, the map has its own. So they arrive as a slot, after
 * the to-dos, and a screen with nothing to offer passes nothing.
 */
describe('IdeaPanel — the verbs slot', () => {
  it('renders what the screen hands it, last', () => {
    renderPanel({ actions: <button type="button">Open on the board</button> });

    expect(screen.getByRole('button', { name: 'Open on the board' })).toBeInTheDocument();
  });

  it('puts the verbs after the to-dos, never before them', () => {
    const { container } = renderPanel({ actions: <button type="button">Open on the board</button> });

    const verb = screen.getByRole('button', { name: 'Open on the board' });
    const todos = screen.getByText('To-do');
    expect(
      todos.compareDocumentPosition(verb) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.firstElementChild?.lastElementChild).toBe(verb);
  });

  it('offers no verbs of its own when the screen passes none', () => {
    renderPanel();

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to Set aside' })).not.toBeInTheDocument();
  });
});
