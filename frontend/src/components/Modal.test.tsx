import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Fork this bundle?">
        content
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders as an accessible dialog, labelled by its title, and moves focus into it', () => {
    render(
      <Modal open onClose={() => {}} title="Fork this bundle?">
        <p>Two versions can sit side by side.</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Fork this bundle?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Nothing focusable in this body, so the dialog itself takes focus.
    expect(document.activeElement).toBe(dialog);
  });

  // Regression: focus used to go to the dialog wrapper unconditionally, which
  // defeated a child's autoFocus — a form modal opened with focus nowhere
  // useful and the first typed character could be lost.
  it('focuses the first control in the body, not the close button', () => {
    render(
      <Modal open onClose={() => {}} title="Add an idea">
        <input aria-label="What's the idea?" />
        <input aria-label="Where is it?" />
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("What's the idea?"));
  });

  it('honours an explicit autoFocus over document order', () => {
    render(
      <Modal open onClose={() => {}} title="Add an idea">
        <input aria-label="First" />
        <input aria-label="Second" autoFocus />
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('Second'));
  });

  it('traps Tab inside the dialog, wrapping at both ends', async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={() => {}} title="Add an idea">
        <input aria-label="Only field" />
      </Modal>,
    );

    const field = screen.getByLabelText('Only field');
    const close = screen.getByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(field);

    // Close sits first in the DOM, the field last. Tabbing forward from the
    // last focusable wraps round to the first rather than escaping the dialog.
    await user.tab();
    expect(document.activeElement).toBe(close);

    // And Shift+Tab from the first wraps back to the last.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(field);
  });

  it('closes on Escape and via the close button, but not on a click inside the panel', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Fork this bundle?">
        <p>Two versions can sit side by side.</p>
      </Modal>,
    );
    await userEvent.click(screen.getByText('Two versions can sit side by side.'));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
