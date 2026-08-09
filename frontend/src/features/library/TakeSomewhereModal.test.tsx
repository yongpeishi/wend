import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast';
import { TakeSomewhereModal } from './TakeSomewhereModal';
import { api } from '../../api';

function renderModal(onDone: (tripId: number) => void, selectedIds: number[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <TakeSomewhereModal open onClose={() => {}} selectedCount={selectedIds.length} selectedIds={selectedIds} onDone={onDone} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

// Entry id 5 is the seeded library idea ("Fushimi Inari at dawn", src/mocks/db.ts) —
// kind: idea, no parent links at all, so it starts out squarely in the library.
const LIBRARY_ENTRY_ID = 5;

describe('TakeSomewhereModal', () => {
  it('creates a trip and links every selected idea into it, never deleting or moving them', async () => {
    const user = userEvent.setup();
    let doneTripId: number | null = null;
    renderModal((tripId) => {
      doneTripId = tripId;
    }, [LIBRARY_ENTRY_ID]);

    await user.type(screen.getByLabelText("What's this trip called?"), 'A weekend in Kyoto');
    await user.click(screen.getByRole('button', { name: 'Start the trip' }));

    await waitFor(() => expect(doneTripId).not.toBeNull());
    const tripId = doneTripId as unknown as number;

    // The idea itself still exists, untouched and unarchived — "link, never move".
    const detail = await api.get<{ entry: { id: number; title: string; archived_at: string | null } }>(
      `/entries/${LIBRARY_ENTRY_ID}`,
    );
    expect(detail.entry.title).toBe('Fushimi Inari at dawn');
    expect(detail.entry.archived_at).toBeNull();

    // It's now also reachable from the new trip — the link actually landed.
    const tripEntries = await api.get<{ entries: { id: number }[] }>('/entries', {
      params: { trip_id: tripId, kind: 'idea' },
    });
    expect(tripEntries.entries.map((e) => e.id)).toContain(LIBRARY_ENTRY_ID);
  });

  it('never issues a delete or archive call against the selected ideas', async () => {
    const user = userEvent.setup();
    const seen: { method: string; url: string }[] = [];
    const originalFetch = window.fetch;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ method: init?.method ?? 'GET', url: String(input) });
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      renderModal(() => {}, [LIBRARY_ENTRY_ID]);
      await user.type(screen.getByLabelText("What's this trip called?"), 'A weekend in Kyoto');
      await user.click(screen.getByRole('button', { name: 'Start the trip' }));
      await waitFor(() => expect(seen.some((r) => r.url.includes('/links'))).toBe(true));
    } finally {
      window.fetch = originalFetch;
    }

    const destructive = seen.filter((r) => r.method === 'DELETE');
    expect(destructive).toEqual([]);
  });

  it('is disabled with no title, and does nothing with an empty selection', async () => {
    const user = userEvent.setup();
    const onDone = () => {
      throw new Error('should not be called');
    };
    renderModal(onDone, []);
    const startButton = screen.getByRole('button', { name: 'Start the trip' });
    expect(startButton).toBeDisabled();
    await user.type(screen.getByLabelText("What's this trip called?"), 'Nowhere yet');
    // A title alone with zero selected ideas still shouldn't be clickable to a crash —
    // the button itself stays enabled (a trip with no ideas is valid, per architecture.md §1),
    // but nothing is selected, so there is nothing to link.
    await user.click(startButton);
  });
});
