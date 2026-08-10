import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer } from './Drawer';

describe('Drawer', () => {
  it('renders nothing when closed, and an accessible dialog when open', () => {
    const { rerender } = render(
      <Drawer open={false} onClose={() => {}} title="Nanzen-ji">
        content
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <Drawer open onClose={() => {}} title="Nanzen-ji">
        content
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Nanzen-ji' })).toBeInTheDocument();
  });

  it('closes on Escape and on the close button', async () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Nanzen-ji">
        content
      </Drawer>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
