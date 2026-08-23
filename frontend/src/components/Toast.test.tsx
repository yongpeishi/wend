import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast, ToastProvider, useToast } from './Toast';

describe('Toast', () => {
  it('renders the message as plain --text-strong text, never colour-coded, regardless of tone', () => {
    render(<Toast message="Kept — it's waiting in your shortlist." tone="success" />);
    expect(screen.getByText("Kept — it's waiting in your shortlist.")).toBeInTheDocument();
  });

  it('uses role="alert" for error tone (assertive) and role="status" otherwise (polite)', () => {
    const { rerender } = render(<Toast message="Saved" tone="success" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<Toast message="Failed" tone="error" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('calls onDismiss when the dismiss button is activated', async () => {
    const onDismiss = vi.fn();
    render(<Toast message="Saved" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders the action as a button, and activating it runs the handler then dismisses', async () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    render(<Toast message="Entry removed" action={{ label: 'Undo', onClick }} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders no action button at all for the plain toasts every existing caller shows', () => {
    render(<Toast message="Saved" onDismiss={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });
});

function ShowButton() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show('Kept nine places so far', 'success')}>
      Trigger
    </button>
  );
}

function ShowWithOptionsButton({
  action,
  durationMs,
}: {
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show('Entry removed', 'neutral', { action, durationMs })}>
      Trigger
    </button>
  );
}

describe('ToastProvider / useToast', () => {
  it('mounts a toast when show() is called', async () => {
    render(
      <ToastProvider>
        <ShowButton />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(await screen.findByText('Kept nine places so far')).toBeInTheDocument();
  });

  it('passes the action through show() — clicking it runs the handler and removes the toast', async () => {
    const onClick = vi.fn();
    render(
      <ToastProvider>
        <ShowWithOptionsButton action={{ label: 'Undo', onClick }} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('Entry removed')).not.toBeInTheDocument();
  });

  // The linger is asserted through the setTimeout wiring rather than a fake
  // clock: userEvent's internal waits deadlock under vitest's mocked timers
  // in this suite, and what the contract actually promises is *which delay
  // gets scheduled* — so that is what these two tests read.

  it('honours a custom durationMs — the auto-dismiss is scheduled at the override, and firing it removes the toast', () => {
    const timeoutSpy = vi.spyOn(window, 'setTimeout');
    try {
      render(
        <ToastProvider>
          <ShowWithOptionsButton durationMs={10000} />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
      expect(screen.getByText('Entry removed')).toBeInTheDocument();

      const scheduled = timeoutSpy.mock.calls.find((call) => call[1] === 10000);
      expect(scheduled).toBeDefined();
      expect(timeoutSpy.mock.calls.some((call) => call[1] === 4000)).toBe(false);

      act(() => {
        (scheduled![0] as () => void)();
      });
      expect(screen.queryByText('Entry removed')).not.toBeInTheDocument();
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('keeps scheduling the 4s default when no options are given — existing callers behave unchanged', () => {
    const timeoutSpy = vi.spyOn(window, 'setTimeout');
    try {
      render(
        <ToastProvider>
          <ShowButton />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
      expect(screen.getByText('Kept nine places so far')).toBeInTheDocument();
      expect(timeoutSpy.mock.calls.some((call) => call[1] === 4000)).toBe(true);
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
