import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayStrip } from './DayStrip';
import type { DayChip } from './dayPlan';
import styles from './DayStrip.module.css';

const chips: DayChip[] = [
  { day: '2026-10-12', dow: 'MON', date: '12' },
  { day: '2026-10-13', dow: 'TUE', date: '13' },
  { day: '2026-10-14', dow: 'WED', date: '14' },
];

describe('DayStrip', () => {
  it('renders one button per day, named by its weekday and date', () => {
    render(<DayStrip chips={chips} activeDay="2026-10-12" onSelect={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'WED 14' })).toBeInTheDocument();
  });

  it('marks the active day with aria-current and leaves the others unmarked', () => {
    render(<DayStrip chips={chips} activeDay="2026-10-13" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'TUE 13' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'MON 12' })).not.toHaveAttribute('aria-current');
  });

  it('gives the active chip its own class, so "you are here" is drawn as well as announced', () => {
    render(<DayStrip chips={chips} activeDay="2026-10-13" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'TUE 13' })).toHaveClass(styles.chipActive);
    expect(screen.getByRole('button', { name: 'MON 12' })).not.toHaveClass(styles.chipActive);
  });

  it('calls onSelect with the ISO day of the chip that was tapped', async () => {
    const onSelect = vi.fn();
    render(<DayStrip chips={chips} activeDay="2026-10-12" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'WED 14' }));
    expect(onSelect).toHaveBeenCalledWith('2026-10-14');
  });

  it('is a nav labelled "Days" unless the caller says otherwise', () => {
    const { unmount } = render(<DayStrip chips={chips} activeDay="2026-10-12" onSelect={() => {}} />);
    expect(screen.getByRole('navigation', { name: 'Days' })).toBeInTheDocument();
    unmount();

    render(<DayStrip chips={chips} activeDay="2026-10-12" onSelect={() => {}} aria-label="Days of the trip" />);
    expect(screen.getByRole('navigation', { name: 'Days of the trip' })).toBeInTheDocument();
  });

  // A dateless trip has no weekdays to show, only its own count of days. The
  // strip does not know that — it prints whatever dayChips() gave it.
  it('renders a dateless trip’s "DAY 1" chips the same way', () => {
    const dateless: DayChip[] = [
      { day: '2026-10-12', dow: 'DAY', date: '1' },
      { day: '2026-10-13', dow: 'DAY', date: '2' },
    ];
    render(<DayStrip chips={dateless} activeDay="2026-10-13" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'DAY 2' })).toHaveAttribute('aria-current', 'true');
  });
});
