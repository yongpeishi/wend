import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageTitle } from './PageTitle';

describe('PageTitle', () => {
  it('renders its name as a level-2 heading', () => {
    render(<PageTitle>Itinerary</PageTitle>);
    // Level 2, always: the trip's title above it is the page's one <h1>, so a
    // screen's name is a section heading under it on every tab.
    expect(screen.getByRole('heading', { level: 2, name: 'Itinerary' })).toBeInTheDocument();
  });

  it('takes an id, for an aria-labelledby elsewhere to point at', () => {
    render(<PageTitle id="map-heading">Map</PageTitle>);
    expect(screen.getByRole('heading', { name: 'Map' })).toHaveAttribute('id', 'map-heading');
  });

  it('draws the same class wherever it is used, so the style has one home', () => {
    const { rerender } = render(<PageTitle>Ideas</PageTitle>);
    const first = screen.getByRole('heading').className;
    rerender(<PageTitle>Checklist</PageTitle>);
    expect(screen.getByRole('heading').className).toBe(first);
  });
});
