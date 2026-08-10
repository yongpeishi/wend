import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Logo } from './Logo';

describe('Logo', () => {
  it('renders the mark with an accessible name and the WEND wordmark by default', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Wend' })).toBeInTheDocument();
    expect(screen.getByText('Wend')).toBeInTheDocument();
  });

  it('hides the wordmark when showWordmark is false (favicons, stamps)', () => {
    render(<Logo showWordmark={false} />);
    expect(screen.queryByText('Wend')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Wend' })).toBeInTheDocument();
  });

  it('thickens the stroke at small sizes (<=28px) — same rule as michikusa-mark-small.svg', () => {
    const { container } = render(<Logo size={24} showWordmark={false} />);
    const path = container.querySelector('path');
    expect(path).toHaveAttribute('stroke-width', '5');
    expect(path).toHaveAttribute('stroke-dasharray', '1 7');
  });

  it('uses full-size stroke geometry above 28px', () => {
    const { container } = render(<Logo size={40} showWordmark={false} />);
    const path = container.querySelector('path');
    expect(path).toHaveAttribute('stroke-width', '3');
    expect(path).toHaveAttribute('stroke-dasharray', '1 8');
  });
});
