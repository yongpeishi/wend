import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '../../components/Toast';
import { TripRoleProvider } from '../../auth/TripRoleContext';
import { NewBundleForm } from './NewBundleForm';
import { api } from '../../api';

const TRIP_ID = 7;

/**
 * One QueryClient per test, captured in a closure — building it inside the
 * wrapper component body would mint a fresh client on every re-render and
 * reset any mutation in flight.
 */
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

function renderForm(
  handlers: { onToast?: (message: string) => void; onClose?: () => void } = {},
) {
  return render(
    <NewBundleForm
      tripId={TRIP_ID}
      onToast={handlers.onToast ?? (() => {})}
      onClose={handlers.onClose ?? (() => {})}
    />,
    { wrapper: makeWrapper() },
  );
}

describe('NewBundleForm — naming a bundle in the rail', () => {
  // The form is mounted only while it is wanted, so arriving and being ready
  // to type are the same event.
  it('takes focus as soon as it appears', () => {
    renderForm();
    expect(screen.getByLabelText('Name a new bundle')).toHaveFocus();
  });

  // Dragging is an accelerator for filling a bundle, never for making one. The
  // typed name is the only way in, so it has to be a properly labelled control,
  // not a placeholder pretending to be a label.
  it('labels the name field with a real label, not just a placeholder', () => {
    renderForm();
    expect(screen.getByLabelText('Name a new bundle')).toBeInTheDocument();
  });

  it('creates an empty bundle from a typed name, on Enter', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ entry: { id: 1, title: 'Day one dinner' } });
    const onToast = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderForm({ onToast, onClose });

    await user.type(screen.getByLabelText('Name a new bundle'), 'Day one dinner{Enter}');

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [path, body] = post.mock.calls[0] as [string, unknown];
    expect(path).toBe('/entries');
    // An empty bundle is a legitimate placeholder — no member link is created
    // alongside it, and nothing blocks the create for want of contents.
    expect(body).toEqual({ entry: { kind: 'bundle', title: 'Day one dinner' }, parent_id: TRIP_ID });
    expect(post).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onToast).toHaveBeenCalled());
    // The form has done its job and asks to be put away.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    post.mockRestore();
  });

  it('abandons the name on Escape, keeping nothing', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ entry: {} });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderForm({ onClose });

    await user.type(screen.getByLabelText('Name a new bundle'), 'Half a thought{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('will not create a bundle named only whitespace', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ entry: {} });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Name a new bundle'), '   ');
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();

    await user.keyboard('{Enter}');
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });

  // A viewer never reaches this — BundlePanel's "+ New bundle" is gone — but a
  // create surface refuses on its own account rather than trusting its caller.
  it('does not render for a viewer', () => {
    render(
      <TripRoleProvider role="viewer">
        <NewBundleForm tripId={TRIP_ID} onToast={() => {}} onClose={() => {}} />
      </TripRoleProvider>,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByLabelText('Name a new bundle')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
  });
});
