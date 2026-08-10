import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HatchPlaceholder } from './HatchPlaceholder';

describe('HatchPlaceholder', () => {
  it('renders as a decorative, aria-hidden block at the requested size', () => {
    render(<HatchPlaceholder size={56} />);
    const el = screen.getByRole('img', { hidden: true });
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveStyle({ width: '56px', height: '56px' });
  });

  it('defaults to 56px, the Place row thumbnail size', () => {
    render(<HatchPlaceholder />);
    expect(screen.getByRole('img', { hidden: true })).toHaveStyle({ width: '56px', height: '56px' });
  });
});
