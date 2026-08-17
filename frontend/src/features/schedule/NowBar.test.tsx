import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NowBar } from './NowBar';
import styles from './NowBar.module.css';

const line = { title: 'Fushimi Inari', sub: 'Until 15:40 · then Nishiki market at 16:30' };

describe('NowBar', () => {
  it('shows what you are on and what comes after it', () => {
    render(<NowBar line={line} onOpenNearby={() => {}} />);
    expect(screen.getByText('Fushimi Inari')).toBeInTheDocument();
    expect(screen.getByText('Until 15:40 · then Nishiki market at 16:30')).toBeInTheDocument();
  });

  it('says a loose day plainly, and draws no second line when there is none', () => {
    const { container } = render(
      <NowBar line={{ title: 'Nothing planned yet', sub: '' }} onOpenNearby={() => {}} />,
    );
    expect(screen.getByText('Nothing planned yet')).toBeInTheDocument();
    expect(container.querySelector(`.${styles.sub}`)).toBeNull();
  });

  it('asks what is nearby when the pill is tapped', async () => {
    const onOpenNearby = vi.fn();
    render(<NowBar line={line} onOpenNearby={onOpenNearby} />);
    await userEvent.click(screen.getByRole('button', { name: "What's nearby" }));
    expect(onOpenNearby).toHaveBeenCalledOnce();
  });

  // While the browser is asking for a fix the button says so and stops taking
  // taps — a second tap would only start the same question again.
  it('goes to "Finding you…" and disabled while busy', async () => {
    const onOpenNearby = vi.fn();
    render(<NowBar line={line} onOpenNearby={onOpenNearby} busy />);

    const button = screen.getByRole('button', { name: 'Finding you…' });
    expect(button).toBeDisabled();
    expect(screen.queryByRole('button', { name: "What's nearby" })).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(onOpenNearby).not.toHaveBeenCalled();
  });
});
