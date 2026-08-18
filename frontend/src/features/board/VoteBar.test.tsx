import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoteBar } from './VoteBar';
import type { VoteTally, VoteVoter } from '../../api/types';

function voter(overrides: Partial<VoteVoter> & { score: VoteVoter['score'] }): VoteVoter {
  return { user_id: 1, user_name: 'Sarah', ...overrides };
}

/** A tally whose aggregate agrees with its voters, as the wire's always does. */
function tallyOf(voters: VoteVoter[]): VoteTally {
  const total = voters.reduce((sum, one) => sum + one.score, 0);
  return {
    total,
    count: voters.length,
    average: voters.length === 0 ? 0 : total / voters.length,
    voters,
  };
}

const VOTERS = [
  voter({ user_id: 1, user_name: 'Sarah', score: 2 }),
  voter({ user_id: 2, user_name: 'Peter', score: 2 }),
  voter({ user_id: 3, user_name: 'Mika', score: -1 }),
];

interface BarOptions {
  myVote?: number | null;
  voters?: VoteVoter[];
  onVote?: (score: number) => void;
  onClear?: () => void;
  disabled?: boolean;
  canVote?: boolean;
}

function renderBar(options: BarOptions = {}) {
  return render(
    <VoteBar
      myVote={options.myVote ?? null}
      tally={tallyOf(options.voters ?? VOTERS)}
      onVote={options.onVote ?? (() => {})}
      onClear={options.onClear ?? (() => {})}
      disabled={options.disabled}
      canVote={options.canVote}
      entryTitle="Fushimi Inari"
    />,
  );
}

describe('VoteBar — the ballot', () => {
  it('offers five stops, best first, each named in plain words', () => {
    renderBar();

    expect(screen.getByRole('radiogroup', { name: 'How keen are you on Fushimi Inari?' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((stop) => stop.getAttribute('aria-label'))).toEqual([
      'Really keen',
      'Keen',
      'Neutral',
      'Not keen',
      'Really not keen',
    ]);
  });

  it('marks your vote and only yours', () => {
    renderBar({ myVote: 1 });

    expect(screen.getByRole('radio', { name: 'Keen' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByRole('radio').filter((stop) => stop.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });

  it('reports the score you pick', async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();
    renderBar({ myVote: null, onVote });

    await user.click(screen.getByRole('radio', { name: 'Really not keen' }));

    expect(onVote).toHaveBeenCalledWith(-2);
  });

  // Clicking your own answer takes it back — otherwise the only exit from a
  // vote is another vote, and "never mind" would land in the total as neutral.
  it('withdraws the vote when you click the stop you already chose', async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();
    const onClear = vi.fn();
    renderBar({ myVote: 2, onVote, onClear });

    await user.click(screen.getByRole('radio', { name: 'Really keen' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onVote).not.toHaveBeenCalled();
  });

  // `disabled` is a save in flight: the stops stay, greyed, and take nothing.
  it('keeps the stops but takes no answer while a save is in flight', async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();
    renderBar({ myVote: null, onVote, disabled: true });

    const stops = screen.getAllByRole('radio');
    expect(stops).toHaveLength(5);
    await user.click(screen.getByRole('radio', { name: 'Keen' }));

    expect(onVote).not.toHaveBeenCalled();
  });
});

describe('VoteBar — the result', () => {
  it('groups the voters into one pill per score, with the headcount and the names', () => {
    renderBar();

    const pills = screen.getAllByRole('button').filter((button) => button.getAttribute('role') !== 'radio');
    expect(pills.map((pill) => pill.textContent)).toEqual([
      'Really keen: Sarah, Peter2Sarah, Peter',
      'Not keen: Mika1Mika',
    ]);
    expect(screen.getByRole('button', { name: 'Really keen: Sarah, Peter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not keen: Mika' })).toBeInTheDocument();
  });

  it('leaves out the scores nobody chose', () => {
    renderBar();

    expect(screen.queryByRole('button', { name: /^Neutral:/ })).not.toBeInTheDocument();
  });

  it('calls a nameless voter Someone rather than leaving a gap', () => {
    renderBar({ voters: [voter({ user_id: 7, user_name: null, score: 1 })] });

    expect(screen.getByRole('button', { name: 'Keen: Someone' })).toBeInTheDocument();
  });

  it('says so plainly when nobody has voted', () => {
    renderBar({ voters: [] });

    expect(screen.getByText('No votes yet')).toBeInTheDocument();
  });
});

// A viewer gets the answer, not a greyed-out ballot: five dead stops read as
// being locked out of the vote rather than as a result (architecture.md §5).
describe('VoteBar — a viewer', () => {
  it('gets the tally and the pills, and no ballot at all', () => {
    renderBar({ canVote: false });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText('Keen?')).not.toBeInTheDocument();
    expect(screen.getByText('+3 · 3 votes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Really keen: Sarah, Peter' })).toBeInTheDocument();
  });

  it('counts one vote in the singular', () => {
    renderBar({ canVote: false, voters: [voter({ score: -1 })] });

    expect(screen.getByText('-1 · 1 vote')).toBeInTheDocument();
  });

  it('drops the summary entirely when there is nothing to summarise', () => {
    renderBar({ canVote: false, voters: [] });

    expect(screen.getByText('No votes yet')).toBeInTheDocument();
    expect(screen.queryByText(/vote[s]?$/)).toBeNull();
  });
});
