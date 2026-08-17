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

  // `disabled` is the caller's "not right now" — a save in flight, for someone
  // who may vote again the moment it lands. The stops are coming back, so they
  // grey rather than go.
  it('greys the stops but keeps them when disabled is set, since the ask is still open', () => {
    render(<VoteControl value={null} onChange={() => {}} disabled />);
    const stops = screen.getAllByRole('radio');
    expect(stops).toHaveLength(5);
    for (const radio of stops) {
      expect(radio).toBeDisabled();
    }
  });

  it('is editable by default, so nothing outside a trip has to say so', () => {
    render(<VoteControl value={null} onChange={() => {}} />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeEnabled();
    }
  });
});

/**
 * The complaint this answers: a viewer was shown five stops to vote with, then
 * refused at all five. That is a ballot they cannot fill in, and it reads as
 * being shut out rather than as a result. They are not being asked, so there is
 * no question to render — only what everyone else already said.
 */
describe('VoteControl — someone who cannot edit', () => {
  it('offers nothing to vote with — not a greyed stop, no stop at all', () => {
    const { container } = render(
      <VoteControl value={2} onChange={() => {}} canEdit={false} average={1.5} count={2} />,
    );

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    // Belt and braces: the roles above would also be absent if the buttons were
    // merely hidden from assistive tech, and the point is that there are none.
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('says the average and how many people said it', () => {
    render(<VoteControl value={null} onChange={() => {}} canEdit={false} average={1.5} count={2} />);
    expect(screen.getByText('1.5 · 2 votes')).toBeInTheDocument();
  });

  it('counts one vote in the singular, because "1 votes" reads as a bug', () => {
    render(<VoteControl value={null} onChange={() => {}} canEdit={false} average={2} count={1} />);
    expect(screen.getByText('2.0 · 1 vote')).toBeInTheDocument();
  });

  it('says nobody has said anything yet rather than printing a hollow 0.0', () => {
    render(<VoteControl value={null} onChange={() => {}} canEdit={false} average={0} count={0} />);
    expect(screen.getByText('No votes yet')).toBeInTheDocument();
  });

  it('says the same when there is no tally to read at all', () => {
    render(<VoteControl value={null} onChange={() => {}} canEdit={false} />);
    expect(screen.getByText('No votes yet')).toBeInTheDocument();
  });

  /** A bare number tells a screen reader nothing about what was rated; the
   * sighted reader has the heading above it, so the label rides in front. */
  it('keeps the caller-given label on the summary, out of sight', () => {
    render(
      <VoteControl
        value={null}
        onChange={() => {}}
        canEdit={false}
        average={1.5}
        count={2}
        aria-label="Everyone's rating for Fushimi Inari"
      />,
    );
    expect(screen.getByText("Everyone's rating for Fushimi Inari:")).toBeInTheDocument();
  });
});
