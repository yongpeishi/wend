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
    expect(document.activeElement).toBe(dialog);
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
