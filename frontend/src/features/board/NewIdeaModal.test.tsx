import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
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

    const nameField = screen.getByLabelText("What's the idea?");
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

    await user.type(screen.getByLabelText("What's the idea?"), 'Fushimi torii at sunrise{Enter}');

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

    await user.type(screen.getByLabelText("What's the idea?"), 'Kaiseki dinner');
    await user.type(screen.getByLabelText('Where is it?'), 'Gion');
    await user.type(screen.getByLabelText('How long does it take?'), '120');
    await user.selectOptions(screen.getByLabelText('What kind of thing?'), 'food');
    await user.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const entries = await api.get<
      { entries: { title: string; category: string | null; location_name: string | null; duration_minutes: number | null }[] }
    >('/entries', { params: { trip_id: TRIP_ID, kind: 'idea' } });
    const idea = entries.entries.find((e) => e.title === 'Kaiseki dinner');
    if (!idea) console.log('ALL ENTRIES', JSON.stringify(entries.entries, null, 2));
    expect(idea).toMatchObject({ category: 'food', location_name: 'Gion', duration_minutes: 120 });
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
      await user.type(screen.getByLabelText("What's the idea?"), 'Something I will not keep');
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
});
