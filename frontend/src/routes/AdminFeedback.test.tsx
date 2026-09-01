import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { BLANK_SCREENSHOT_DATA_URI, db } from '../mocks/db';
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

/** The row carrying that message. Two of the seeded rows are from the same
 * reporter, so a row is found by what it says, never by whose it is. */
function rowFor(message: string): HTMLElement {
  return screen.getByText(message).closest('tr') as HTMLElement;
}

/** That row's disclosure button — the only button in a row; the status control
 * is a combobox. */
function chevronFor(message: string): HTMLElement {
  return within(rowFor(message)).getByRole('button');
}

/** The detail a row opens: the `<tr>` immediately after it, present in the DOM
 * only while the row is expanded. */
function detailOf(message: string): HTMLElement {
  return rowFor(message).nextElementSibling as HTMLElement;
}

describe('AdminFeedback', () => {
  it('lists everyone’s feedback, newest first', async () => {
    renderPage();

    // All five seeded rows, from both reporters.
    expect(
      await screen.findByText('The checklist loses my tick when I scroll — it comes back on reload though.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sign-in kept rejecting my password until I retyped it by hand.')).toBeInTheDocument();

    // Newest first: the seed's created_at ordering, not its array order.
    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('The checklist loses my tick');
    expect(rows[4]).toHaveTextContent('Sign-in kept rejecting my password');
  });

  it('names the reporter with their address', async () => {
    renderPage();
    const row = (await screen.findByText('Love the itinerary view. Could the map pins use the same colours as the categories?')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Demo Traveler')).toBeInTheDocument();
    expect(within(row).getByText('demo@wend.app')).toBeInTheDocument();
  });

  it('shows where the feedback came from, capture and all, once the row is open', async () => {
    // "Where" is no longer one of the always-visible columns — it moved into
    // the disclosure, so this now asserts the same two things one click later.
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('This button says "Set aside" but nothing visibly moves.');

    await user.click(chevronFor('This button says "Set aside" but nothing visibly moves.'));

    const detail = detailOf('This button says "Set aside" but nothing visibly moves.');
    expect(within(detail).getByText('http://localhost:5173/trips/1/schedule')).toBeInTheDocument();
    expect(within(detail).getByText(/button\[data-testid="set-aside"\]/)).toBeInTheDocument();
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

  it('picks a note up — new to in progress — through its select', async () => {
    const user = userEvent.setup();
    renderPage();

    const row = (await screen.findByText('The checklist loses my tick when I scroll — it comes back on reload though.')).closest('tr') as HTMLElement;
    const select = within(row).getByRole('combobox', { name: 'Status of feedback from Sarah' });

    await user.selectOptions(select, 'in_progress');

    await waitFor(() => expect(db.feedbacks.find((f) => f.id === 901)?.status).toBe('in_progress'));
    expect(select).toHaveValue('in_progress');
  });

  it('offers the CSV export as a button', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  // Screenshots in the seed: 901 has two, 903 has one, 902, 904 and 905 have none.
  describe('the row disclosure', () => {
    const CHECKLIST = 'The checklist loses my tick when I scroll — it comes back on reload though.';
    const SET_ASIDE = 'This button says "Set aside" but nothing visibly moves.';
    const MAP_PINS = 'Love the itinerary view. Could the map pins use the same colours as the categories?';

    it('keeps the detail closed until the chevron is clicked, and closes it again', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(CHECKLIST);

      // Collapsed: the table is five columns of triage and nothing else.
      expect(screen.queryByText('http://localhost:5173/trips/1/checklist')).not.toBeInTheDocument();
      expect(screen.queryByText('Screenshots')).not.toBeInTheDocument();

      const toggle = chevronFor(CHECKLIST);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveAccessibleName('Show details of feedback from Sarah');

      await user.click(toggle);

      expect(chevronFor(CHECKLIST)).toHaveAttribute('aria-expanded', 'true');
      expect(chevronFor(CHECKLIST)).toHaveAccessibleName('Hide details of feedback from Sarah');
      expect(screen.getByText('http://localhost:5173/trips/1/checklist')).toBeInTheDocument();

      // The button says what it controls, and that row really is the detail.
      expect(chevronFor(CHECKLIST).getAttribute('aria-controls')).toBe(detailOf(CHECKLIST).id);

      await user.click(chevronFor(CHECKLIST));

      expect(chevronFor(CHECKLIST)).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('http://localhost:5173/trips/1/checklist')).not.toBeInTheDocument();
    });

    it('holds several rows open at once, each chevron independent of the others', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(CHECKLIST);

      await user.click(chevronFor(CHECKLIST));
      await user.click(chevronFor(SET_ASIDE));

      // Opening the second did not close the first — the point of the Set.
      expect(chevronFor(CHECKLIST)).toHaveAttribute('aria-expanded', 'true');
      expect(chevronFor(SET_ASIDE)).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('http://localhost:5173/trips/1/checklist')).toBeInTheDocument();
      expect(screen.getByText('http://localhost:5173/trips/1/schedule')).toBeInTheDocument();

      // And closing one leaves the other open rather than clearing the lot.
      await user.click(chevronFor(CHECKLIST));
      expect(chevronFor(CHECKLIST)).toHaveAttribute('aria-expanded', 'false');
      expect(chevronFor(SET_ASIDE)).toHaveAttribute('aria-expanded', 'true');
    });

    it('shows each screenshot as a link to the full image, named by its file', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(CHECKLIST);

      await user.click(chevronFor(CHECKLIST));
      const detail = detailOf(CHECKLIST);

      const links = within(detail).getAllByRole('link');
      expect(links).toHaveLength(2);
      // A bare chevron's row now carries both of 901's shots, in seed order.
      expect(links.map((a) => a.textContent)).toEqual(['checklist-before.png', 'checklist-after.png']);
      for (const link of links) {
        expect(link).toHaveAttribute('href', BLANK_SCREENSHOT_DATA_URI);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      }

      // The thumbnail itself is decorative beside the link that names it.
      const images = within(detail).getAllByRole('presentation');
      expect(images).toHaveLength(2);
      expect(images[0]).toHaveAttribute('src', BLANK_SCREENSHOT_DATA_URI);

      // One row's shots stay in that row.
      await user.click(chevronFor(SET_ASIDE));
      expect(within(detailOf(SET_ASIDE)).getAllByRole('link')).toHaveLength(1);
      expect(within(detailOf(SET_ASIDE)).getByRole('link')).toHaveAccessibleName('set-aside.jpg');
    });

    it('shows where a report with no screenshots came from, and no empty gallery', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(MAP_PINS);

      await user.click(chevronFor(MAP_PINS));
      const detail = detailOf(MAP_PINS);

      expect(within(detail).getByText('Where')).toBeInTheDocument();
      expect(within(detail).getByText('http://localhost:5173/trips/1/map')).toBeInTheDocument();
      // Not an empty heading, not an empty grid — nothing at all.
      expect(within(detail).queryByText('Screenshots')).not.toBeInTheDocument();
      expect(within(detail).queryAllByRole('link')).toHaveLength(0);
      expect(within(detail).queryAllByRole('presentation')).toHaveLength(0);
    });

    it('surfaces the browser the report came from, which the table never had room for', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(CHECKLIST);

      await user.click(chevronFor(CHECKLIST));
      expect(
        within(detailOf(CHECKLIST)).getByText(/iPhone OS 18_5 like Mac OS X\) Safari/),
      ).toBeInTheDocument();
    });
  });

  // The seed is one of each status past `new` and two fresh ones: 901 new,
  // 902 new, 905 in progress, 903 rejected, 904 done.
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
      expect(screen.getAllByRole('row')).toHaveLength(6); // header + five
      expect(screen.getByText('5 notes')).toBeInTheDocument();

      await user.click(statusChip('New'));

      expect(screen.getAllByRole('row')).toHaveLength(3); // header + the two new ones
      expect(statusChip('New')).toHaveAttribute('aria-pressed', 'true');
      // Filtered, not gone — the count still names the whole pile.
      expect(screen.getByText('2 of 5 notes')).toBeInTheDocument();

      // Each chip is its own way back out.
      await user.click(statusChip('New'));
      expect(screen.getAllByRole('row')).toHaveLength(6);
      expect(screen.getByText('5 notes')).toBeInTheDocument();
    });

    it('takes several statuses at once, each chip independent of the others', async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByText('The checklist loses my tick when I scroll — it comes back on reload though.');
      await user.click(statusChip('New'));
      await user.click(statusChip('Rejected'));

      // Everything but the in-progress note and the done one.
      expect(screen.getByText('This button says "Set aside" but nothing visibly moves.')).toBeInTheDocument();
      expect(
        screen.queryByText('Sign-in kept rejecting my password until I retyped it by hand.'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('The day picker jumps back to today whenever I edit an item.'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('3 of 5 notes')).toBeInTheDocument();

      // Dropping one leaves the other lit rather than clearing the filter.
      await user.click(statusChip('New'));
      expect(statusChip('Rejected')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('1 of 5 notes')).toBeInTheDocument();
    });

    it('lights the in-progress pile on its own', async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByText('The checklist loses my tick when I scroll — it comes back on reload though.');
      await user.click(statusChip('In progress'));

      expect(
        screen.getByText('The day picker jumps back to today whenever I edit an item.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('The checklist loses my tick when I scroll — it comes back on reload though.'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('1 of 5 notes')).toBeInTheDocument();
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
      expect(screen.getByText('1 of 5 notes')).toBeInTheDocument();
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

  // The seed's deletable pile: 903 rejected (Sarah) and 904 done (Demo). The
  // other three — 901, 902 new, 905 in progress — are what the gate refuses.
  describe('deleting feedback', () => {
    const CHECKLIST = 'The checklist loses my tick when I scroll — it comes back on reload though.';
    const SET_ASIDE = 'This button says "Set aside" but nothing visibly moves.';
    const DAY_PICKER = 'The day picker jumps back to today whenever I edit an item.';
    const SIGNIN = 'Sign-in kept rejecting my password until I retyped it by hand.';

    function checkboxFor(message: string): HTMLInputElement {
      return within(rowFor(message)).getByRole('checkbox') as HTMLInputElement;
    }

    function headerCheckbox(): HTMLInputElement {
      return screen.getByRole('checkbox', { name: 'Select all deletable notes shown' }) as HTMLInputElement;
    }

    function statusChip(label: string) {
      return within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: label });
    }

    it('offers the checkbox only where the server would take the delete', async () => {
      renderPage();
      await screen.findByText(CHECKLIST);

      // Finished notes can be taken; the rest are refused with the reason in
      // the checkbox's own name — the API's words, so nothing has to be learnt
      // twice.
      expect(checkboxFor(SET_ASIDE)).toBeEnabled();
      expect(checkboxFor(SIGNIN)).toBeEnabled();
      expect(checkboxFor(CHECKLIST)).toBeDisabled();
      expect(checkboxFor(DAY_PICKER)).toBeDisabled();
      expect(checkboxFor(CHECKLIST)).toHaveAccessibleName(
        'Select feedback from Sarah — only done or rejected feedback can be deleted',
      );

      // No selection, no delete button — the toolbar stays triage until then.
      expect(screen.queryByRole('button', { name: /Delete selected/ })).not.toBeInTheDocument();
    });

    it('takes and releases every deletable row through the header checkbox', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(CHECKLIST);

      await user.click(headerCheckbox());

      expect(checkboxFor(SET_ASIDE)).toBeChecked();
      expect(checkboxFor(SIGNIN)).toBeChecked();
      expect(checkboxFor(CHECKLIST)).not.toBeChecked();
      expect(screen.getByRole('button', { name: 'Delete selected (2)' })).toBeInTheDocument();

      await user.click(headerCheckbox());

      expect(checkboxFor(SET_ASIDE)).not.toBeChecked();
      expect(checkboxFor(SIGNIN)).not.toBeChecked();
      expect(screen.queryByRole('button', { name: /Delete selected/ })).not.toBeInTheDocument();
    });

    it('sits indeterminate while it holds only some of the deletable rows', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(CHECKLIST);

      await user.click(checkboxFor(SET_ASIDE));

      expect(headerCheckbox()).not.toBeChecked();
      expect(headerCheckbox().indeterminate).toBe(true);

      await user.click(checkboxFor(SIGNIN));

      expect(headerCheckbox()).toBeChecked();
      expect(headerCheckbox().indeterminate).toBe(false);
    });

    it('deletes the chosen notes once the dialog has said what goes', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(CHECKLIST);

      await user.click(headerCheckbox());
      await user.click(screen.getByRole('button', { name: 'Delete selected (2)' }));

      // The dialog carries the count, the screenshots, and the no-undo.
      const dialog = await screen.findByRole('dialog', { name: 'Delete 2 notes?' });
      expect(
        within(dialog).getByText('They come off the server, screenshots and all, and there is no undo.'),
      ).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Yes, delete them' }));

      await waitFor(() => expect(screen.queryByText(SET_ASIDE)).not.toBeInTheDocument());
      expect(screen.queryByText(SIGNIN)).not.toBeInTheDocument();
      // The rest of the pile is untouched, and both DELETEs landed on the store.
      expect(screen.getByText(CHECKLIST)).toBeInTheDocument();
      expect(db.feedbacks.map((f) => f.id).sort()).toEqual([901, 902, 905]);
      expect(await screen.findByText('Deleted 2 notes and their screenshots.')).toBeInTheDocument();
    });

    it('says it in the singular for one note', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(SET_ASIDE);

      await user.click(checkboxFor(SET_ASIDE));
      await user.click(screen.getByRole('button', { name: 'Delete selected (1)' }));

      const dialog = await screen.findByRole('dialog', { name: 'Delete 1 note?' });
      await user.click(within(dialog).getByRole('button', { name: 'Yes, delete it' }));

      await waitFor(() => expect(screen.queryByText(SET_ASIDE)).not.toBeInTheDocument());
      expect(screen.getByText(SIGNIN)).toBeInTheDocument();
      expect(await screen.findByText('Deleted 1 note and its screenshots.')).toBeInTheDocument();
    });

    it('cancels without deleting anything, selection kept', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(SET_ASIDE);

      await user.click(checkboxFor(SET_ASIDE));
      await user.click(screen.getByRole('button', { name: 'Delete selected (1)' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'No, keep it' }),
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText(SET_ASIDE)).toBeInTheDocument();
      expect(db.feedbacks.some((f) => f.id === 903)).toBe(true);
      // Still chosen — cancelling declines the delete, not the selection.
      expect(checkboxFor(SET_ASIDE)).toBeChecked();
      expect(screen.getByRole('button', { name: 'Delete selected (1)' })).toBeInTheDocument();
    });

    it('drops hidden rows from the selection when the filter narrows', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(CHECKLIST);

      await user.click(headerCheckbox());
      expect(screen.getByRole('button', { name: 'Delete selected (2)' })).toBeInTheDocument();

      // Narrowing to Done hides the rejected note, and hidden means unchosen —
      // "Delete selected" must never include a row the admin cannot see.
      await user.click(statusChip('Done'));
      expect(screen.getByRole('button', { name: 'Delete selected (1)' })).toBeInTheDocument();

      // Widening again does not quietly re-arm it.
      await user.click(statusChip('Done'));
      expect(screen.getByRole('button', { name: 'Delete selected (1)' })).toBeInTheDocument();
      expect(checkboxFor(SET_ASIDE)).not.toBeChecked();
      expect(checkboxFor(SIGNIN)).toBeChecked();
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
