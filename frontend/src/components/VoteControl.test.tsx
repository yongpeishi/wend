import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoteControl } from './VoteControl';

describe('VoteControl', () => {
  it('exposes five stops as a radiogroup, each with a plain-word accessible name (no legend needed)', () => {
    render(<VoteControl value={null} onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Desire rating' })).toBeInTheDocument();
    const stops = screen.getAllByRole('radio');
    expect(stops).toHaveLength(5);
    expect(screen.getByRole('radio', { name: 'Really want this' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Would rather not' })).toBeInTheDocument();
  });

  it('marks the current value as checked and reports the others as unchecked', () => {
    render(<VoteControl value={2} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Really want this' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Neutral' })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange with the score when an unselected stop is activated', async () => {
    const onChange = vi.fn();
    render(<VoteControl value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Interested' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('clicking the already-selected stop calls onClear instead of onChange, withdrawing the vote', async () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(<VoteControl value={1} onChange={onChange} onClear={onClear} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Interested' }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the aggregate tally in DM Mono text when supplied, never as coloured text', () => {
    render(<VoteControl value={1} onChange={() => {}} average={1.5} count={2} />);
    expect(screen.getByText('1.5 · 2')).toBeInTheDocument();
  });

  it('disables every stop when disabled is set', () => {
    render(<VoteControl value={null} onChange={() => {}} disabled />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
  });

  // Viewers cannot vote — a backend rule too, so this is the client saying the
  // same thing the server would rather than a decoration.
  it('disables every stop for someone who cannot edit, while still showing the tally', () => {
    render(<VoteControl value={2} onChange={() => {}} canEdit={false} average={1.5} count={2} />);

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
    // The stops are also the picture of what has been decided, so they stay.
    expect(screen.getByRole('radio', { name: 'Really want this' })).toBeChecked();
    expect(screen.getByText('1.5 · 2')).toBeInTheDocument();
  });

  it('is editable by default, so nothing outside a trip has to say so', () => {
    render(<VoteControl value={null} onChange={() => {}} />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeEnabled();
    }
  });
});
