import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrailNav } from './TrailNav';

describe('TrailNav', () => {
  it('renders Brainstorm, Gather, Schedule in order', () => {
    render(<TrailNav current="gather" />);
    expect(screen.getByText('Brainstorm')).toBeInTheDocument();
    expect(screen.getByText('Gather')).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

  it('lets you select a completed (decided) step back, but not a future (waiting) one', async () => {
    const onSelect = vi.fn();
    render(<TrailNav current="gather" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Brainstorm' }));
    expect(onSelect).toHaveBeenCalledWith('brainstorm');
    expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument();
  });

  it('is read-only (no buttons) when onSelect is omitted', () => {
    render(<TrailNav current="gather" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
