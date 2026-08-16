import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GapRow } from './GapRow';

const AFTERNOON = { kind: 'gap', startsAtMinutes: 14 * 60 + 15, endsAtMinutes: 18 * 60 + 30 } as const;

describe('GapRow', () => {
  it('names the hole and how long it is, without calling it a problem', () => {
    render(<GapRow row={AFTERNOON} />);

    expect(screen.getByText('14:15–18:30')).toBeInTheDocument();
    expect(screen.getByText('Nothing planned · 4 hr 15')).toBeInTheDocument();
  });

  it('writes a short hole in minutes', () => {
    render(<GapRow row={{ kind: 'gap', startsAtMinutes: 600, endsAtMinutes: 645 }} />);

    expect(screen.getByText('Nothing planned · 45 min')).toBeInTheDocument();
  });

  it('offers to fill it', async () => {
    const user = userEvent.setup();
    const onFill = vi.fn();
    render(<GapRow row={AFTERNOON} onFill={onFill} />);

    await user.click(screen.getByRole('button', { name: 'Fill it' }));

    expect(onFill).toHaveBeenCalled();
  });

  it('offers nothing when there is nothing to offer it to', () => {
    render(<GapRow row={AFTERNOON} />);

    expect(screen.queryByRole('button', { name: 'Fill it' })).not.toBeInTheDocument();
  });

  it('is shown, not filled, once the version it belongs to is archived', () => {
    render(<GapRow row={AFTERNOON} onFill={() => {}} readOnly />);

    expect(screen.getByText('Nothing planned · 4 hr 15')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fill it' })).not.toBeInTheDocument();
  });
});
