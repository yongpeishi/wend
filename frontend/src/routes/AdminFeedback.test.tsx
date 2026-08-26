import { beforeEach, describe, expect, it } from 'vitest';
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

    await user.selectOptions(select, 'triaged');

    // The PATCH landed on the mock store — the mutation really fired.
    await waitFor(() => expect(db.feedbacks.find((f) => f.id === 901)?.status).toBe('triaged'));
    expect(select).toHaveValue('triaged');
  });

  it('offers the CSV export as a button', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  it('says so when there is nothing to triage', async () => {
    db.feedbacks = [];
    renderPage();
    expect(
      await screen.findByText('Nothing yet. When a traveller sends feedback, it lands here.'),
    ).toBeInTheDocument();
  });
});
