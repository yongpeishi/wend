import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloseButton } from './CloseButton';

describe('CloseButton', () => {
  it('renders a button named "Close" that does not submit a surrounding form', () => {
    render(<CloseButton onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('type', 'button');
  });

  it('calls onClick once per click', async () => {
    const onClick = vi.fn();
    render(<CloseButton onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('lays an extra class alongside its own rather than replacing it', () => {
    render(<CloseButton onClick={() => {}} className="custom" />);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveClass('custom');
    expect(button.className).toMatch(/closeButton/);
  });
});
