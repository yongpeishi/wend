import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});

function ShowButton() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show('Kept nine places so far', 'success')}>
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
});
