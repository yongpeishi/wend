import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntryRow } from './EntryRow';
import styles from './EntryRow.module.css';

describe('EntryRow', () => {
  it('joins metadata with middots, e.g. "Temple · east · 40 min"', () => {
    render(<EntryRow title="Nanzen-ji" metadata={['Temple', 'east', '40 min']} kept={false} onSelect={() => {}} />);
    expect(screen.getByText('Temple · east · 40 min')).toBeInTheDocument();
  });

  it('opens the entry via a real button, separate from the keep toggle (no nested buttons)', async () => {
    const onSelect = vi.fn();
    const onToggleKeep = vi.fn();
    render(<EntryRow title="Nanzen-ji" kept={false} onSelect={onSelect} onToggleKeep={onToggleKeep} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2); // main row button + keep toggle, siblings not nested
    await userEvent.click(screen.getByRole('button', { name: 'Nanzen-ji' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onToggleKeep).not.toHaveBeenCalled();
  });

  it('the keep toggle reports its state via aria-pressed and calls back with the next value', async () => {
    const onToggleKeep = vi.fn();
    const { rerender } = render(<EntryRow title="Kiyamachi" kept={false} onToggleKeep={onToggleKeep} />);
    const toggle = screen.getByRole('button', { name: 'Keep Kiyamachi' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(onToggleKeep).toHaveBeenCalledWith(true);

    rerender(<EntryRow title="Kiyamachi" kept onToggleKeep={onToggleKeep} />);
    expect(screen.getByRole('button', { name: /Kept: Kiyamachi/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keep toggle uses the 48x48 tap-target class even though the visible dot is 28px', () => {
    render(<EntryRow title="Kiyamachi" kept onToggleKeep={() => {}} />);
    expect(screen.getByRole('button', { name: /Kept/ })).toHaveClass(styles.keepToggle);
  });

  it('renders a non-interactive row when onSelect and onToggleKeep are both omitted', () => {
    render(<EntryRow title="Kiyamachi" kept={false} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  // Not rendered rather than greyed: an unlabelled circle that refuses is worse
  // than an absent one. Opening the entry is reading, so that button stays.
  it('drops the keep toggle for someone who cannot edit, and keeps the row itself', () => {
    render(
      <EntryRow title="Kiyamachi" metadata={['Kyoto']} kept onToggleKeep={() => {}} onSelect={() => {}} canEdit={false} />,
    );

    expect(screen.queryByRole('button', { name: /Kept/ })).not.toBeInTheDocument();
    expect(screen.getByText('Kiyamachi')).toBeInTheDocument();
    expect(screen.getByText('Kyoto')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
