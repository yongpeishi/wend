import type { ReactNode } from 'react';
import { Button } from '../design/components/core/Button';
import { EmptyState } from './EmptyState';
import { Spinner } from './Spinner';

/**
 * The slice of a TanStack Query result the gate actually reads. Structural on
 * purpose — any `UseQueryResult` satisfies it as-is, and a test can hand in a
 * three-field object instead of standing up a whole query client.
 *
 * `isPending`, not `isLoading`: they differ exactly when a query is PAUSED —
 * offline, or a hidden tab — before its first data. There `isLoading` is
 * false, and a gate reading it would fall through to children with no data,
 * which is the empty-state lie this component exists to prevent. `isPending`
 * stays true until data (or an error) actually arrives, so pending-and-paused
 * holds the spinner; and because it goes false once data exists, a paused
 * background refetch on a screen that already has data still renders children.
 */
export interface QueryGateSource {
  isPending: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

export interface QueryGateProps {
  /**
   * The query the region below cannot render without — or several, for a
   * screen assembled from more than one request, where any of them failing
   * means the picture would be wrong, not merely partial.
   */
  query: QueryGateSource | QueryGateSource[];
  /** Announced while loading — see Spinner. e.g. "Finding your trips". */
  loadingLabel: string;
  /**
   * Full sentence(s) in Wend's voice for when the load fails — see
   * architecture.md §5. Say what didn't load and that nothing is lost, e.g.
   * "Your days didn't load. Nothing is lost — everything you've placed is
   * still on them."
   */
  errorMessage: string;
  children: ReactNode;
}

/**
 * Stands between a query and the region drawn from it. Loading gets the
 * spinner; a failed load gets an honest message and a way to try again —
 * never the empty-state copy, which would affirmatively claim nothing exists
 * when the truth is we couldn't ask.
 *
 * Gate only the data-dependent region: chrome that stands on its own
 * (headers, filter bars, modals) belongs outside, exactly where the old
 * isLoading ternary sat.
 */
export function QueryGate({ query, loadingLabel, errorMessage, children }: QueryGateProps) {
  const queries = Array.isArray(query) ? query : [query];

  if (queries.some((q) => q.isPending)) {
    return <Spinner label={loadingLabel} />;
  }

  if (queries.some((q) => q.isError)) {
    return (
      <EmptyState
        message={errorMessage}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              // Only the requests that failed: re-fetching a healthy sibling
              // would blank data the screen already holds.
              for (const q of queries) {
                if (q.isError) void q.refetch();
              }
            }}
          >
            Try again
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
}
