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

  /**
   * The width is a class, not a style, so this asserts the only thing a test
   * can see: that `size` reaches the dialog and that the default does not carry
   * it. What the class is worth is in Modal.module.css — 760px instead of 560,
   * which is what lets a panel put two fields on a line.
   */
  it('takes the extra width only when asked for it', () => {
    const { unmount } = render(
      <Modal open onClose={() => {}} title="Fushimi Inari at dawn" size="wide">
        content
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).toMatch(/wide/);
    unmount();

    render(
      <Modal open onClose={() => {}} title="Fork this bundle?">
        content
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).not.toMatch(/wide/);
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

  // Regression: the keydown effect used to depend on onClose's identity, so a
  // caller passing a fresh close handler each render — the natural thing to
  // write — re-ran Modal's effects on every keystroke. Every caller had to
  // memoize its handler in self-defence.
  it('keeps focus in a body input when onClose changes identity across renders', async () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Add an idea">
        <input aria-label="What's the idea?" />
      </Modal>,
    );
    const field = screen.getByLabelText("What's the idea?");
    expect(document.activeElement).toBe(field);

    await userEvent.keyboard('ramen');
    rerender(
      <Modal open onClose={() => {}} title="Add an idea">
        <input aria-label="What's the idea?" />
      </Modal>,
    );
    expect(document.activeElement).toBe(field);
  });

  it('Escape calls the latest onClose after a re-render swaps the handler', async () => {
    const stale = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(
      <Modal open onClose={stale} title="Add an idea">
        <input aria-label="What's the idea?" />
      </Modal>,
    );
    rerender(
      <Modal open onClose={latest} title="Add an idea">
        <input aria-label="What's the idea?" />
      </Modal>,
    );

    await userEvent.keyboard('{Escape}');
    expect(stale).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });
});
