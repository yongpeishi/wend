import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { db } from '../../mocks/db';
import { FEEDBACK_SCREENSHOT_MAX_BYTES } from '../../api/feedback';
import { FeedbackButton } from './FeedbackButton';

// Integration test, same shape as FeedbackButton.test.tsx: the real hooks
// against the MSW fixtures, so an attachment that reaches `db.feedbacks` has
// been through the multipart encoder and the mock's validations on the way.

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
                  <main id="page">
                    <button type="button" data-testid="set-aside" className="_button_1p9dt_29 _quiet_1p9dt_44">
                      Set aside
                    </button>
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

/** The hidden `<input type="file">` the "Add screenshots" button stands in for. */
function fileInput() {
  return screen.getByLabelText('Choose screenshot files');
}

function png(name: string, bytes = 8) {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

/**
 * jsdom has no blob registry, so `URL.createObjectURL` is simply absent and any
 * component that makes a thumbnail throws without this. The counter makes each
 * URL distinct, which is what lets the revoke assertions name the one that went
 * — a stub returning a constant string would pass those tests even if the
 * component revoked the wrong attachment's URL.
 */
let objectUrlCount = 0;
const createObjectURL = vi.fn(() => `blob:screenshot-${++objectUrlCount}`);
const revokeObjectURL = vi.fn();

// Installed for the file rather than installed and torn down around each test.
// Vitest runs afterEach hooks last-registered-first, so an afterEach here would
// put the real (i.e. missing) functions back *before* Testing Library's own
// cleanup unmounts the composer — and the composer revokes its previews on
// unmount, so every test that ended with a file attached died in teardown with
// "URL.revokeObjectURL is not a function". Each test file gets its own jsdom,
// so nothing outside this one sees the stubs.
URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

beforeEach(() => {
  db.currentUserId = db.users[0]?.id ?? null;
  db.feedbacks = [];
  objectUrlCount = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

describe('FeedbackComposer screenshots', () => {
  it('offers a way to attach, and says what will be taken', async () => {
    renderApp();
    await openComposer();

    expect(screen.getByRole('button', { name: /Add screenshots/ })).toBeEnabled();
    expect(screen.getByText(/Up to 5 images, 5 MB each/)).toBeInTheDocument();
  });

  it('opens the file picker from the button rather than showing a raw file input', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    renderApp();
    await openComposer();

    await userEvent.click(screen.getByRole('button', { name: /Add screenshots/ }));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('shows a thumbnail for a file chosen from the picker', async () => {
    renderApp();
    await openComposer();

    await userEvent.upload(fileInput(), png('Screenshot 1.png'));

    expect(await screen.findByRole('button', { name: 'Remove Screenshot 1.png' })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    const thumb = within(dialog).getByTitle('Screenshot 1.png');
    expect(thumb).toHaveAttribute('src', 'blob:screenshot-1');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('drops an attachment and lets go of its preview URL', async () => {
    renderApp();
    await openComposer();
    await userEvent.upload(fileInput(), [png('one.png'), png('two.png')]);

    await userEvent.click(await screen.findByRole('button', { name: 'Remove one.png' }));

    expect(screen.queryByRole('button', { name: 'Remove one.png' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove two.png' })).toBeInTheDocument();
    // The leak this whole feature is one mistake away from: the removed
    // attachment's URL, and only that one, is handed back.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:screenshot-1');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:screenshot-2');
  });

  it('takes five and refuses the sixth, saying which was left out', async () => {
    renderApp();
    await openComposer();

    await userEvent.upload(fileInput(), [
      png('a.png'),
      png('b.png'),
      png('c.png'),
      png('d.png'),
      png('e.png'),
      png('f.png'),
    ]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Only 5 screenshots per report — left out f.png.');
    expect(screen.getAllByRole('button', { name: /^Remove .*\.png$/ })).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Remove f.png' })).not.toBeInTheDocument();
    // No preview was minted for the file that was turned away.
    expect(createObjectURL).toHaveBeenCalledTimes(5);
  });

  it('closes the door once five are attached', async () => {
    renderApp();
    await openComposer();
    await userEvent.upload(fileInput(), [png('a.png'), png('b.png'), png('c.png'), png('d.png'), png('e.png')]);

    expect(await screen.findByText("That's the limit — 5 screenshots.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add screenshots/ })).toBeDisabled();
  });

  it('keeps the good files in a batch and names the ones it would not take', async () => {
    // applyAccept is off because the `accept` attribute is a hint the file
    // dialog offers, not a rule it enforces — "All files" is one menu away in
    // every browser — and the composer's own check is what is under test here.
    const user = userEvent.setup({ applyAccept: false });
    renderApp();
    await openComposer();

    const oversized = new File([new Uint8Array(FEEDBACK_SCREENSHOT_MAX_BYTES + 1)], 'huge.png', { type: 'image/png' });
    const wrongType = new File(['%PDF-'], 'notes.pdf', { type: 'application/pdf' });
    await user.upload(fileInput(), [png('good.png'), wrongType, oversized]);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('notes.pdf is not a PNG, JPEG, WebP or GIF image.');
    expect(alert).toHaveTextContent('huge.png is larger than 5 MB.');
    expect(screen.getByRole('button', { name: 'Remove good.png' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove notes.pdf' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove huge.png' })).not.toBeInTheDocument();
  });

  it('attaches an image pasted into the message box', async () => {
    renderApp();
    await openComposer();

    fireEvent.paste(screen.getByLabelText('Tell us what you noticed'), {
      clipboardData: { files: [png('pasted.png')], types: ['Files'] },
    });

    expect(await screen.findByRole('button', { name: 'Remove pasted.png' })).toBeInTheDocument();
  });

  it('attaches an image dropped onto the composer, and looks like a target while it hovers', async () => {
    renderApp();
    await openComposer();
    // The drop zone wraps everything in the modal body, so the textarea's
    // parent is it — and firing on a descendant is the honest test anyway,
    // since a real drop lands on whatever is under the pointer and bubbles.
    const zone = screen.getByLabelText('Tell us what you noticed').parentElement;
    if (!zone) throw new Error('the drop zone is missing');
    const dataTransfer = { files: [png('dropped.png')], types: ['Files'], dropEffect: 'none' };

    const atRest = zone.className;
    fireEvent.dragEnter(zone, { dataTransfer });
    const whileHovering = zone.className;
    fireEvent.dragOver(zone, { dataTransfer });
    fireEvent.drop(zone, { dataTransfer });

    expect(await screen.findByRole('button', { name: 'Remove dropped.png' })).toBeInTheDocument();
    // The drop state paints while the file is over the modal and is gone after.
    expect(whileHovering).not.toBe(atRest);
    expect(zone.className).toBe(atRest);
  });

  it('sends the attached files along with the message', async () => {
    renderApp('/trips/4/map');
    await openComposer();
    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), 'The pin sits in the sea');
    await userEvent.upload(fileInput(), [png('map.png'), png('zoomed.png')]);

    await userEvent.click(screen.getByRole('button', { name: 'Send it' }));

    await waitFor(() => expect(db.feedbacks).toHaveLength(1));
    expect(db.feedbacks[0]).toMatchObject({ message: 'The pin sits in the sea' });
    expect(db.feedbacks[0]?.screenshots.map((shot) => shot.filename)).toEqual(['map.png', 'zoomed.png']);
    expect(db.feedbacks[0]?.screenshots[0]?.content_type).toBe('image/png');
  });

  it('starts the next report empty, with nothing left in the blob registry', async () => {
    renderApp();
    await openComposer();
    await userEvent.type(screen.getByLabelText('Tell us what you noticed'), 'First note');
    await userEvent.upload(fileInput(), png('first.png'));
    await userEvent.click(screen.getByRole('button', { name: 'Send it' }));
    await waitFor(() => expect(db.feedbacks).toHaveLength(1));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:screenshot-1');

    await openComposer();
    expect(await screen.findByLabelText('Tell us what you noticed')).toHaveValue('');
    expect(screen.queryByRole('button', { name: /^Remove .*\.png$/ })).not.toBeInTheDocument();
  });

  it('forgets the attachments of an abandoned report too', async () => {
    renderApp();
    await openComposer();
    await userEvent.upload(fileInput(), png('never-sent.png'));
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:screenshot-1');

    await openComposer();
    expect(screen.queryByRole('button', { name: 'Remove never-sent.png' })).not.toBeInTheDocument();
  });

  it('keeps the attachments through a trip to the element picker', async () => {
    // The composer's Modal unmounts while picking. Losing the files someone
    // just attached to the act of pointing at the thing they illustrate would
    // be the same bug as losing the draft.
    renderApp();
    await openComposer();
    await userEvent.upload(fileInput(), png('kept.png'));

    await userEvent.click(screen.getByRole('button', { name: /Point at something/ }));
    await userEvent.click(screen.getByTestId('set-aside'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Remove kept.png' })).toBeInTheDocument();
    // Still one URL: the round trip did not re-mint the preview.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});
