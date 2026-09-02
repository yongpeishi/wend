import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SwapDayMenu } from './SwapDayMenu';

const CHOICES = [
  { day: '2026-10-12', label: 'Day 1 · Mon 12' },
  { day: '2026-10-13', label: 'Day 2 · Tue 13' },
  { day: '2026-10-14', label: 'Day 3 · Wed 14' },
];

function renderMenu() {
  const onSwap = vi.fn();
  render(<SwapDayMenu day="2026-10-13" dayLabel="Day 2 · Tue 13" choices={CHOICES} onSwap={onSwap} />);
  return { onSwap };
}

const trigger = () => screen.getByRole('button', { name: /Swap .* with another day/ });

describe('SwapDayMenu', () => {
  it('closes from the X with nothing swapped, and hands focus back to the trigger', async () => {
    const user = userEvent.setup();
    const { onSwap } = renderMenu();

    await user.click(trigger());
    expect(screen.getByRole('group')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(onSwap).not.toHaveBeenCalled();
    expect(trigger()).toHaveFocus();
  });

  it('walks the days with the arrows, never the X', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    expect(screen.getByRole('button', { name: 'Swap with Day 1 · Mon 12' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('button', { name: 'Swap with Day 3 · Wed 14' })).toHaveFocus();
  });
});
