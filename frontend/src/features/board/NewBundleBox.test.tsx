import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '../../components/Toast';
import { NewBundleBox } from './NewBundleBox';
import { useCreateBundleWithIdea } from './useCreateBundle';
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
        <ToastProvider>
          <DndContext>{children}</DndContext>
        </ToastProvider>
      </QueryClientProvider>
    );
  };
}

function renderBox(onToast: (message: string) => void = () => {}) {
  return render(<NewBundleBox tripId={TRIP_ID} onToast={onToast} />, { wrapper: makeWrapper() });
}

describe('NewBundleBox — starting a bundle without a modal', () => {
  // Dropping is an accelerator. The typed name is the equivalent that works
  // with a keyboard, a switch or a screen reader, so it has to be a properly
  // labelled control, not a placeholder pretending to be a label.
  it('labels the name field with a real label, not just a placeholder', () => {
    renderBox();
    expect(screen.getByLabelText('Name a new bundle')).toBeInTheDocument();
  });

  it('creates an empty bundle from a typed name, on Enter', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ entry: { id: 1, title: 'Day one dinner' } });
    const onToast = vi.fn();
    renderBox(onToast);

    await user.type(screen.getByLabelText('Name a new bundle'), 'Day one dinner{Enter}');

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [path, body] = post.mock.calls[0] as [string, unknown];
    expect(path).toBe('/entries');
    // An empty bundle is a legitimate placeholder — no member link is created
    // alongside it, and nothing blocks the create for want of contents.
    expect(body).toEqual({ entry: { kind: 'bundle', title: 'Day one dinner' }, parent_id: TRIP_ID });
    expect(post).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onToast).toHaveBeenCalled());
    post.mockRestore();
  });

  it('will not create a bundle named only whitespace', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ entry: {} });
    renderBox();

    await user.type(screen.getByLabelText('Name a new bundle'), '   ');
    expect(screen.getByRole('button', { name: 'Start it' })).toBeDisabled();

    await user.keyboard('{Enter}');
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });
});

describe('useCreateBundleWithIdea — the drop path', () => {
  // The link needs an id that does not exist until the bundle POST returns, so
  // the two calls must be ordered, not fired together.
  it('creates the bundle first, then links the dropped idea into it', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation(async (path: string) => {
      if (path === '/entries') return { entry: { id: 55, title: 'Ramen alley bundle' } };
      return { link: {} };
    });

    const { result } = renderHook(() => useCreateBundleWithIdea(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ tripId: TRIP_ID, entryId: 91, ideaTitle: 'Ramen alley' });

    const calls = post.mock.calls.map((call) => call[0] as string);
    expect(calls[0]).toBe('/entries');
    expect(calls[1]).toBe('/entries/55/links');

    const [, createBody] = post.mock.calls[0] as [string, { entry: { kind: string; title: string }; parent_id: number }];
    expect(createBody.entry.kind).toBe('bundle');
    // Named after the idea that started it, so four drops do not produce four
    // identically-named bundles.
    expect(createBody.entry.title).toBe('Ramen alley bundle');
    expect(createBody.parent_id).toBe(TRIP_ID);

    const [, linkBody] = post.mock.calls[1] as [string, { child_id: number }];
    expect(linkBody.child_id).toBe(91);
    post.mockRestore();
  });

  it('surfaces a failed create as one failed action, without linking anything', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useCreateBundleWithIdea(), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({ tripId: TRIP_ID, entryId: 91, ideaTitle: 'Ramen alley' }),
    ).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(1);
    post.mockRestore();
  });
});
