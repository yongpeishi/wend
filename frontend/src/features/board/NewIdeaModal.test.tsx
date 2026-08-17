import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { TripRoleProvider } from '../../auth/TripRoleContext';
import { NewIdeaModal } from './NewIdeaModal';
import { api } from '../../api';

// Trip id 1 is the seeded trip ("Six days in Kyoto", src/mocks/db.ts).
const TRIP_ID = 1;

function renderModal(onClose: () => void, onCreated?: (entry: { id: number; title: string }) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <NewIdeaModal open onClose={onClose} parentId={TRIP_ID} onCreated={onCreated} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('NewIdeaModal', () => {
  it('focuses the name field on open, and creates an idea from just a name', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let created: { id: number; title: string } | null = null;
    renderModal(onClose, (entry) => {
      created = entry;
    });

    const nameField = screen.getByLabelText('Name');
    expect(nameField).toHaveFocus();

    await user.type(nameField, 'Ramen alley');
    await user.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(created).not.toBeNull();
    expect((created as unknown as { title: string }).title).toBe('Ramen alley');

    // Only a name was supplied — every other field stays null, never an
    // empty string, and it landed under the trip (parent_id: TRIP_ID).
    const entries = await api.get<{ entries: { id: number; title: string; category: string | null }[] }>('/entries', {
      params: { trip_id: TRIP_ID, kind: 'idea' },
    });
    const idea = entries.entries.find((e) => e.title === 'Ramen alley');
    expect(idea).toBeDefined();
    expect(idea?.category).toBeNull();
  });

  it('submits with the Enter key in the name field — the fast, seconds-long capture path', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal(onClose);

    await user.type(screen.getByLabelText('Name'), 'Fushimi torii at sunrise{Enter}');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const entries = await api.get<{ entries: { title: string }[] }>('/entries', {
      params: { trip_id: TRIP_ID, kind: 'idea' },
    });
    expect(entries.entries.some((e) => e.title === 'Fushimi torii at sunrise')).toBe(true);
  });

  it('keeps the fuller fields when they are filled in', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal(onClose);

    await user.type(screen.getByLabelText('Name'), 'Kaiseki dinner');
    await user.type(screen.getByLabelText('Location'), 'Gion');
    await user.type(screen.getByLabelText('Estimated duration'), '120');
    await user.selectOptions(screen.getByLabelText('Category'), 'food');
    await user.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const entries = await api.get<
      { entries: { title: string; category: string | null; location_name: string | null; duration_minutes: number | null }[] }
    >('/entries', { params: { trip_id: TRIP_ID, kind: 'idea' } });
    const idea = entries.entries.find((e) => e.title === 'Kaiseki dinner');
    if (!idea) console.log('ALL ENTRIES', JSON.stringify(entries.entries, null, 2));
    expect(idea).toMatchObject({ category: 'food', location_name: 'Gion', duration_minutes: 120 });
  });

  /**
   * "Where did you find it?" was a labelled box for one URL, which most ideas
   * never have — and once the edit panel stopped showing that box, a link typed
   * at capture time could be written and never read again. Notes takes it, and
   * says so before you type.
   */
  it('offers notes as the catch-all, and names the link as one of the things that go there', () => {
    renderModal(vi.fn());

    expect(screen.queryByLabelText('Where did you find it?')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('link to where you found it'),
    );
  });

  it('keeps what was typed into notes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal(onClose);

    await user.type(screen.getByLabelText('Name'), 'Ramen alley, second time');
    await user.type(
      screen.getByLabelText('Notes'),
      'https://example.com/ramen-alley — queue before 11',
    );
    await user.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const entries = await api.get<{ entries: { title: string; notes: string | null }[] }>('/entries', {
      params: { trip_id: TRIP_ID, kind: 'idea' },
    });
    const idea = entries.entries.find((e) => e.title === 'Ramen alley, second time');
    expect(idea?.notes).toBe('https://example.com/ramen-alley — queue before 11');
  });

  it('does nothing on Cancel — no request is made and the field clears', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const seen: string[] = [];
    const originalFetch = window.fetch;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') seen.push(String(input));
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      renderModal(onClose);
      await user.type(screen.getByLabelText('Name'), 'Something I will not keep');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
    } finally {
      window.fetch = originalFetch;
    }

    expect(onClose).toHaveBeenCalled();
    expect(seen.some((url) => url.includes('/entries'))).toBe(false);

    const entries = await api.get<{ entries: { title: string }[] }>('/entries', {
      params: { trip_id: TRIP_ID, kind: 'idea' },
    });
    expect(entries.entries.some((e) => e.title === 'Something I will not keep')).toBe(false);
  });

  it('the Keep it button stays disabled with an empty name', () => {
    renderModal(vi.fn());
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeDisabled();
  });

  /**
   * The labels are plain nouns, and they are the same nouns the edit panel uses
   * (EntryDetail.test.tsx asserts the other half). The two forms used to phrase
   * the same question two different ways — "What's the idea?" here against
   * "What is it?" there — which read as two different questions.
   */
  it('names its fields with nouns rather than asking questions', () => {
    renderModal(vi.fn());

    for (const label of ['Name', 'Short description', 'Category', 'Location', 'Address', 'Estimated duration', 'Notes']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    for (const asked of ["What's the idea?", 'What kind of thing?', 'How long does it take?', 'Where is it?', 'Anything worth remembering?']) {
      expect(screen.queryByLabelText(asked)).not.toBeInTheDocument();
    }
  });

  /** The description is the sentence you would say next if someone asked what
   * the idea was, so it follows the name on both surfaces. */
  it('puts the short description directly after the name', () => {
    renderModal(vi.fn());
    const dialog = screen.getByRole('dialog');
    const order = Array.from(dialog.querySelectorAll('label')).map((l) => l.textContent?.trim());

    expect(order.slice(0, 2)).toEqual(['Name', 'Short description']);
  });

  /**
   * The board keeps this mounted whether it is open or not, so a viewer would
   * otherwise be one state flag away from a create form. There is no read-only
   * version of "add an idea" — an empty form nobody can submit is not content —
   * so it refuses to render rather than opening inert.
   */
  it('does not render at all for a viewer, even asked to open', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TripRoleProvider role="viewer">
            <NewIdeaModal open onClose={vi.fn()} parentId={TRIP_ID} />
          </TripRoleProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep it' })).not.toBeInTheDocument();
  });
});
