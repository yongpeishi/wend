import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the canonical voice copy verbatim', () => {
    render(<EmptyState message="Nothing kept yet. Saving something is how a trip starts." />);
    expect(screen.getByText('Nothing kept yet. Saving something is how a trip starts.')).toBeInTheDocument();
  });

  it('renders an optional action', () => {
    render(<EmptyState message="Nothing placed yet." action={<button type="button">Save something</button>} />);
    expect(screen.getByRole('button', { name: 'Save something' })).toBeInTheDocument();
  });
});
