import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { NewTripModal } from './NewTripModal';
import type { Entry } from '../../api/types';

function renderModal(onCreated: (trip: Entry) => void = () => {}, onClose: () => void = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <NewTripModal open onClose={onClose} onCreated={onCreated} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('NewTripModal', () => {
  it('lands focus in the Name field on open', async () => {
    renderModal();
    // Deferred a tick past Modal's own dialog-focus effect (see NewTripModal's
    // comment on why) — wait for it rather than asserting synchronously.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Name')));
  });

  it('requires a name before it will submit, and clears the error once one is typed', async () => {
    const user = userEvent.setup();
    const onCreated = () => {
      throw new Error('should not be called without a name');
    };
    renderModal(onCreated);

    await user.click(screen.getByRole('button', { name: 'Add trip' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A trip needs a name.');

    await user.type(screen.getByLabelText('Name'), 'Malaysia');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cancels cleanly, clearing the draft without creating anything', async () => {
    const user = userEvent.setup();
    let closed = false;
    renderModal(
      () => {
        throw new Error('should not create anything on cancel');
      },
      () => {
        closed = true;
      },
    );

    await user.type(screen.getByLabelText('Name'), 'A trip I changed my mind about');
    await user.type(screen.getByLabelText('Short description'), 'Never mind');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(closed).toBe(true);
  });

  it('creates a dateless trip from just a name, and calls onCreated with it', async () => {
    const user = userEvent.setup();
    let created: Entry | null = null;
    renderModal((trip) => {
      created = trip;
    });

    await user.type(screen.getByLabelText('Name'), 'Malaysia');
    await user.click(screen.getByRole('button', { name: 'Add trip' }));

    await waitFor(() => expect(created).not.toBeNull());
    const trip = created as unknown as Entry;
    expect(trip.title).toBe('Malaysia');
    expect(trip.kind).toBe('trip');
    expect(trip.starts_on).toBeNull();
    expect(trip.ends_on).toBeNull();
  });

  it('creates a trip with a description and dates when they are filled in', async () => {
    const user = userEvent.setup();
    let created: Entry | null = null;
    renderModal((trip) => {
      created = trip;
    });

    await user.type(screen.getByLabelText('Name'), 'Japan');
    await user.type(screen.getByLabelText('Short description'), 'Cherry blossoms, if the timing works out.');
    await user.type(screen.getByLabelText('Starts'), '2026-11-02');
    await user.type(screen.getByLabelText('Ends'), '2026-11-16');
    await user.click(screen.getByRole('button', { name: 'Add trip' }));

    await waitFor(() => expect(created).not.toBeNull());
    const trip = created as unknown as Entry;
    expect(trip.description).toBe('Cherry blossoms, if the timing works out.');
    expect(trip.starts_on).toBe('2026-11-02');
    expect(trip.ends_on).toBe('2026-11-16');
  });

  it('submits on Enter from the Name field', async () => {
    const user = userEvent.setup();
    let created: Entry | null = null;
    renderModal((trip) => {
      created = trip;
    });

    await user.type(screen.getByLabelText('Name'), 'Bali{Enter}');
    await waitFor(() => expect(created).not.toBeNull());
  });

  it('cancels on Escape', async () => {
    const user = userEvent.setup();
    let closed = false;
    renderModal(undefined, () => {
      closed = true;
    });
    await user.keyboard('{Escape}');
    expect(closed).toBe(true);
  });
});
