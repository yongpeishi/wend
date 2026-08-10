import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('exposes role="status" with an accessible (visually-hidden) label', () => {
    render(<Spinner label="Loading trip" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading trip');
  });

  it('defaults its label to "Loading"', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });
});
