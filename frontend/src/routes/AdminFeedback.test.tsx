import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { db } from '../mocks/db';
import { AdminFeedback } from './AdminFeedback';

// Integration test: the real hooks against the MSW fixtures. The admin is set
// directly on the mock store, the FeedbackButton idiom — the guard around this
// page is AdminLayout's and is tested there; this is the table itself.

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/admin/feedback']}>
          <AdminFeedback />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // The seeded demo user is the admin.
  db.currentUserId = 1;
});

describe('AdminFeedback', () => {
  it('lists everyone’s feedback, newest first', async () => {
    renderPage();

    // All four seeded rows, from both reporters.
    expect(
      await screen.findByText('The checklist loses my tick when I scroll — it comes back on reload though.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sign-in kept rejecting my password until I retyped it by hand.')).toBeInTheDocument();

    // Newest first: the seed's created_at ordering, not its array order.
    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('The checklist loses my tick');
    expect(rows[3]).toHaveTextContent('Sign-in kept rejecting my password');
  });

  it('names the reporter with their address', async () => {
    renderPage();
    const row = (await screen.findByText('Love the itinerary view. Could the map pins use the same colours as the categories?')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Demo Traveler')).toBeInTheDocument();
    expect(within(row).getByText('demo@wend.app')).toBeInTheDocument();
  });

  it('shows where the feedback came from, capture and all', async () => {
    renderPage();
    const row = (await screen.findByText('This button says "Set aside" but nothing visibly moves.')).closest('tr') as HTMLElement;
    expect(within(row).getByText('http://localhost:5173/trips/1/schedule')).toBeInTheDocument();
    expect(within(row).getByText(/button\[data-testid="set-aside"\]/)).toBeInTheDocument();
  });

  it('changes a row’s status through its select', async () => {
    const user = userEvent.setup();
    renderPage();

    const row = (await screen.findByText('The checklist loses my tick when I scroll — it comes back on reload though.')).closest('tr') as HTMLElement;
    const select = within(row).getByRole('combobox', { name: 'Status of feedback from Sarah' });
    expect(select).toHaveValue('new');

    await user.selectOptions(select, 'rejected');

    // The PATCH landed on the mock store — the mutation really fired.
    await waitFor(() => expect(db.feedbacks.find((f) => f.id === 901)?.status).toBe('rejected'));
    expect(select).toHaveValue('rejected');
  });

  it('offers the CSV export as a button', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  // The seed is one of each end state and two fresh ones: 901 new, 902 new,
  // 903 rejected, 904 done.
  describe('the status filter', () => {
    /** The chip of that name, not the same-named <option> in a row's select. */
    function statusChip(label: string) {
      return within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: label });
    }

    it('shows the whole pile until a chip is lit, and unlighting widens again', async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByText('The checklist loses my tick when I scroll — it comes back on reload though.');
      expect(statusChip('New')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getAllByRole('row')).toHaveLength(5); // header + four
      expect(screen.getByText('4 notes')).toBeInTheDocument();

      await user.click(statusChip('New'));

      expect(screen.getAllByRole('row')).toHaveLength(3); // header + the two new ones
      expect(statusChip('New')).toHaveAttribute('aria-pressed', 'true');
      // Filtered, not gone — the count still names the whole pile.
      expect(screen.getByText('2 of 4 notes')).toBeInTheDocument();

      // Each chip is its own way back out.
      await user.click(statusChip('New'));
      expect(screen.getAllByRole('row')).toHaveLength(5);
      expect(screen.getByText('4 notes')).toBeInTheDocument();
    });

    it('takes several statuses at once, each chip independent of the others', async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByText('The checklist loses my tick when I scroll — it comes back on reload though.');
      await user.click(statusChip('New'));
      await user.click(statusChip('Rejected'));

      // Everything but the one done note.
      expect(screen.getByText('This button says "Set aside" but nothing visibly moves.')).toBeInTheDocument();
      expect(
        screen.queryByText('Sign-in kept rejecting my password until I retyped it by hand.'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('3 of 4 notes')).toBeInTheDocument();

      // Dropping one leaves the other lit rather than clearing the filter.
      await user.click(statusChip('New'));
      expect(statusChip('Rejected')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('1 of 4 notes')).toBeInTheDocument();
    });

    it('drops a row the moment triage moves it out of the lit statuses', async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByText('The checklist loses my tick when I scroll — it comes back on reload though.');
      await user.click(statusChip('New'));

      const row = screen
        .getByText('The checklist loses my tick when I scroll — it comes back on reload though.')
        .closest('tr') as HTMLElement;
      await user.selectOptions(
        within(row).getByRole('combobox', { name: 'Status of feedback from Sarah' }),
        'done',
      );

      await waitFor(() =>
        expect(
          screen.queryByText('The checklist loses my tick when I scroll — it comes back on reload though.'),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByText('1 of 4 notes')).toBeInTheDocument();
    });

    it('says the statuses are empty rather than that there is nothing at all', async () => {
      const user = userEvent.setup();
      // A pile with nothing rejected in it, so lighting that chip empties the
      // table while the notes themselves are all still there.
      db.feedbacks = db.feedbacks.filter((f) => f.status !== 'rejected');
      renderPage();

      await screen.findByText('The checklist loses my tick when I scroll — it comes back on reload though.');
      await user.click(statusChip('Rejected'));

      expect(
        screen.getByText('Nothing in those statuses. The rest is still here — unlight a chip to widen again.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Nothing yet. When a traveller sends feedback, it lands here.'),
      ).not.toBeInTheDocument();
    });

    it('narrows the CSV export to match what is on screen', async () => {
      const user = userEvent.setup();
      const assign = vi.fn();
      const original = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...original, assign },
      });

      try {
        renderPage();
        await screen.findByText('The checklist loses my tick when I scroll — it comes back on reload though.');

        // Nothing lit: the whole pile, no query string — what the button did
        // before there was a filter at all.
        await user.click(screen.getByRole('button', { name: 'Export CSV' }));
        expect(assign).toHaveBeenLastCalledWith('/api/admin/feedbacks/export');

        await user.click(statusChip('New'));
        await user.click(statusChip('Rejected'));
        await user.click(screen.getByRole('button', { name: 'Export CSV — only the notes shown' }));
        expect(assign).toHaveBeenLastCalledWith(
          '/api/admin/feedbacks/export?status%5B%5D=new&status%5B%5D=rejected',
        );
      } finally {
        Object.defineProperty(window, 'location', { configurable: true, value: original });
      }
    });
  });

  it('says so when there is nothing to triage', async () => {
    db.feedbacks = [];
    renderPage();
    expect(
      await screen.findByText('Nothing yet. When a traveller sends feedback, it lands here.'),
    ).toBeInTheDocument();
  });
});
