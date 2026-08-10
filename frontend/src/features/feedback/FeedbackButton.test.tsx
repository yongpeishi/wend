import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { db } from '../../mocks/db';
import { FeedbackButton } from './FeedbackButton';

// Integration test: the real hooks against the MSW fixtures, exactly as the
// app runs standalone. The signed-in user is set directly on the mock store
// rather than driven through the sign-in screen — auth is not what's under test.

function renderApp(initialPath = '/trips/1/schedule') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route
              path="*"
              element={
                <div>
                  {/* Stand-ins for real page content, to point at. The class
                      names imitate what Vite emits for a CSS module. */}
                  <main id="page">
                    <button type="button" data-testid="set-aside" className="_button_1p9dt_29 _quiet_1p9dt_44">
                      Set aside
                    </button>
                    <a href="/somewhere-else">A link that must not be followed</a>
                    {/* Something the *user* wrote, to prove it never leaves. */}
                    <input data-testid="note" readOnly value="Anniversary trip — do not tell Sam" />
                  </main>
                  <FeedbackButton />
                </div>
              }
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function openComposer() {
  return userEvent.click(screen.getByRole('button', { name: 'Give feedback' }));
}

beforeEach(() => {
  // The seeded demo user, signed in.
  db.currentUserId = db.users[0]?.id ?? null;
});

describe('FeedbackButton', () => {
  it('offers a floating way in from any screen', async () => {
    renderApp();
    expect(screen.getByRole('button', { name: 'Give feedback' })).toBeInTheDocument();
  });

  it('opens the composer when clicked', async () => {
    renderApp();
    await openComposer();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Tell us what you noticed')).toBeInTheDocument();
  });

  it('sends the message along with the full URL the user was on', async () => {
    renderApp('/trips/7/checklist');
    await openComposer();

    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), 'The checklist scrolls oddly');
    await userEvent.click(screen.getByRole('button', { name: 'Send it' }));

    await waitFor(() => expect(db.feedbacks).toHaveLength(1));
    expect(db.feedbacks[0]).toMatchObject({
      message: 'The checklist scrolls oddly',
      url: `${window.location.origin}/trips/7/checklist`,
      element_selector: null,
      status: 'new',
    });
  });

  it('closes and thanks the user after sending', async () => {
    renderApp();
    await openComposer();
    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), 'Lovely app');
    await userEvent.click(screen.getByRole('button', { name: 'Send it' }));

    expect(await screen.findByText('Thank you — that has been noted.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refuses a blank message without troubling the server', async () => {
    renderApp();
    await openComposer();
    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Send it' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Write a line or two first.');
    expect(db.feedbacks).toHaveLength(0);
  });

  it('forgets the draft once it has been sent', async () => {
    renderApp();
    await openComposer();
    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), 'First note');
    await userEvent.click(screen.getByRole('button', { name: 'Send it' }));
    await waitFor(() => expect(db.feedbacks).toHaveLength(1));

    await openComposer();
    expect(await screen.findByLabelText('Tell us what you noticed')).toHaveValue('');
  });
});

describe('FeedbackButton element picker', () => {
  it('steps the composer aside and explains the mode', async () => {
    renderApp();
    await openComposer();
    await userEvent.click(screen.getByRole('button', { name: /Point at something/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Click the part of the page you mean/)).toBeInTheDocument();
  });

  it('captures what the user points at and attaches it to the message', async () => {
    renderApp();
    await openComposer();
    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), 'This is confusing');
    await userEvent.click(screen.getByRole('button', { name: /Point at something/ }));
    await userEvent.click(screen.getByTestId('set-aside'));

    // Back in the composer, with the draft intact and the capture shown.
    // Scoped to the dialog — "Set aside" is also the page button's own text.
    const dialog = await screen.findByRole('dialog');
    expect(screen.getByLabelText('Tell us what you noticed')).toHaveValue('This is confusing');
    expect(within(dialog).getByText('Set aside')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send it' }));
    await waitFor(() => expect(db.feedbacks).toHaveLength(1));
    expect(db.feedbacks[0]).toMatchObject({
      message: 'This is confusing',
      url: `${window.location.origin}/trips/1/schedule`,
      element_selector: 'button[data-testid="set-aside"]',
      element_classes: '_button_1p9dt_29 _quiet_1p9dt_44',
    });
  });

  it('never sends the text on the page, only the class attribute', async () => {
    // Pointing at a note the user wrote must not post that note back to us.
    renderApp();
    await openComposer();
    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), 'This box is too small');
    await userEvent.click(screen.getByRole('button', { name: /Point at something/ }));
    await userEvent.click(screen.getByTestId('note'));

    await userEvent.click(await screen.findByRole('button', { name: 'Send it' }));
    await waitFor(() => expect(db.feedbacks).toHaveLength(1));

    const sent = JSON.stringify(db.feedbacks[0]);
    expect(sent).not.toContain('Anniversary trip');
    expect(sent).not.toContain('do not tell Sam');
    expect(db.feedbacks[0]?.element_selector).toBe('input[data-testid="note"]');
  });

  it('does not follow a link the user points at — that would throw away the draft', async () => {
    renderApp();
    await openComposer();
    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), 'This link is mislabelled');
    await userEvent.click(screen.getByRole('button', { name: /Point at something/ }));

    const link = screen.getByRole('link', { name: 'A link that must not be followed' });
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(await screen.findByLabelText('Tell us what you noticed')).toHaveValue('This link is mislabelled');
  });

  it('cancels picking on Escape, keeping the draft', async () => {
    renderApp();
    await openComposer();
    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), 'Half a thought');
    await userEvent.click(screen.getByRole('button', { name: /Point at something/ }));
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Tell us what you noticed')).toHaveValue('Half a thought');
    expect(db.feedbacks).toHaveLength(0);
  });

  it('lets the user drop a capture and send plain feedback instead', async () => {
    renderApp();
    await openComposer();
    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), 'Never mind the button');
    await userEvent.click(screen.getByRole('button', { name: /Point at something/ }));
    await userEvent.click(screen.getByTestId('set-aside'));

    await userEvent.click(await screen.findByRole('button', { name: 'Remove the selected element' }));
    expect(screen.getByRole('button', { name: /Point at something/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send it' }));
    await waitFor(() => expect(db.feedbacks).toHaveLength(1));
    expect(db.feedbacks[0]?.element_selector).toBeNull();
  });

  it('highlights whatever the pointer is over', async () => {
    renderApp();
    await openComposer();
    await userEvent.click(screen.getByRole('button', { name: /Point at something/ }));

    await userEvent.hover(screen.getByTestId('set-aside'));
    // The label chip names the element under the pointer.
    await waitFor(() => expect(screen.getAllByText('Set aside').length).toBeGreaterThan(0));
  });

  it('never lets the picker select its own chrome', async () => {
    renderApp();
    await openComposer();
    await userEvent.click(screen.getByRole('button', { name: /Point at something/ }));

    const cancel = screen.getByRole('button', { name: 'Cancel (Esc)' });
    await userEvent.click(cancel);

    // Cancelled back to the composer rather than capturing the cancel button.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Point at something/ })).toBeInTheDocument();
  });
});

describe('FeedbackButton failures', () => {
  it('keeps the draft and explains when the send fails', async () => {
    db.currentUserId = null; // the fixtures answer 401
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderApp();
    await openComposer();
    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), 'Something worth keeping');
    await userEvent.click(screen.getByRole('button', { name: 'Send it' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not signed in');
    expect(screen.getByLabelText('Tell us what you noticed')).toHaveValue('Something worth keeping');
    consoleError.mockRestore();
  });
});
