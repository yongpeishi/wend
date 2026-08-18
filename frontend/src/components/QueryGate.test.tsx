import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryGate } from './QueryGate';
import type { QueryGateSource } from './QueryGate';

/** A settled, healthy query — override the flag a test is about. */
function settled(overrides: Partial<QueryGateSource> = {}): QueryGateSource {
  return { isPending: false, isError: false, refetch: vi.fn().mockResolvedValue(undefined), ...overrides };
}

const COPY = "It didn't load. Nothing is lost.";

function renderGate(query: QueryGateSource | QueryGateSource[]) {
  render(
    <QueryGate query={query} loadingLabel="Finding it" errorMessage={COPY}>
      <p>the goods</p>
    </QueryGate>,
  );
}

describe('QueryGate', () => {
  it('shows the spinner with its label while loading, and none of the children', () => {
    renderGate(settled({ isPending: true }));

    expect(screen.getByRole('status')).toHaveTextContent('Finding it');
    expect(screen.queryByText('the goods')).not.toBeInTheDocument();
  });

  // Offline (or a hidden tab), TanStack Query pauses the first fetch: status
  // stays 'pending' but nothing is in flight, so isLoading is false while
  // isPending is true. The gate must hold the spinner there — falling through
  // would render children with no data, the empty-state lie of F1.
  it('holds the spinner for a paused first load — pending, but not fetching', () => {
    renderGate(settled({ isPending: true, isError: false }));

    expect(screen.getByRole('status')).toHaveTextContent('Finding it');
    expect(screen.queryByText('the goods')).not.toBeInTheDocument();
  });

  it('renders the children once the query has settled', () => {
    renderGate(settled());

    expect(screen.getByText('the goods')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the error copy and a way to try again on failure — never the children', () => {
    renderGate(settled({ isError: true }));

    expect(screen.getByText(COPY)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('the goods')).not.toBeInTheDocument();
  });

  it('"Try again" refetches the failed query', async () => {
    const user = userEvent.setup();
    const failed = settled({ isError: true });
    renderGate(failed);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(failed.refetch).toHaveBeenCalledTimes(1);
  });

  it('waits for every query it is given before showing the children', () => {
    renderGate([settled(), settled({ isPending: true })]);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('the goods')).not.toBeInTheDocument();
  });

  it('fails if any query failed, and retries only the one that did', async () => {
    const user = userEvent.setup();
    const healthy = settled();
    const failed = settled({ isError: true });
    renderGate([healthy, failed]);

    expect(screen.getByText(COPY)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(failed.refetch).toHaveBeenCalledTimes(1);
    expect(healthy.refetch).not.toHaveBeenCalled();
  });
});
