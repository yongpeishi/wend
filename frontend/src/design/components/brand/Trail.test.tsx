import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Trail } from './Trail';

describe('Trail', () => {
  it('renders one circle per stop plus the caption labels', () => {
    const { container } = render(<Trail stops={['decided', 'open', 'waiting']} labels={['One', 'Two', 'Three']} />);
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Three')).toBeInTheDocument();
  });

  it('lets a caller select a decided (completed) stop via a real, clickable label', async () => {
    const onSelectStop = vi.fn();
    render(<Trail stops={['decided', 'open', 'waiting']} labels={['Brainstorm', 'Gather', 'Schedule']} onSelectStop={onSelectStop} />);
    const decidedButton = screen.getByRole('button', { name: 'Brainstorm' });
    await userEvent.click(decidedButton);
    expect(onSelectStop).toHaveBeenCalledWith(0);
  });

  it('never makes a "waiting" (not-yet-reached) stop clickable, even when onSelectStop is supplied', () => {
    render(<Trail stops={['decided', 'open', 'waiting']} labels={['Brainstorm', 'Gather', 'Schedule']} onSelectStop={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument();
    expect(screen.getByText('Schedule').tagName).toBe('SPAN');
  });

  it('is purely decorative (no buttons) when onSelectStop is omitted', () => {
    render(<Trail stops={['decided', 'open', 'waiting']} labels={['One', 'Two', 'Three']} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
