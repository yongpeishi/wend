import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';
import { queryKeys } from './queryKeys';

// Mid-session expiry: the session query has staleTime: Infinity, so once it
// holds a user nothing re-checks it — if the cookie dies, every other query
// starts failing with 401 while the UI still looks signed in. Writing
// `session: null` here is what flips ProtectedRoute into its /signin redirect.
// Only the session key is written; sign-out's onSuccess owns full-cache
// clearing, and dropping other users' data is not this handler's job.
//
// No loop is possible: useMe converts its own 401 into a `null` success, so
// the session query itself never lands in this error path. A failed sign-in
// (POST /session -> 401) does reach the mutation branch, but on /signin the
// session key is already null, so the write-back is a no-op there.
function redirectToSignInOn401(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    queryClient.setQueryData(queryKeys.session, null);
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: redirectToSignInOn401,
  }),
  mutationCache: new MutationCache({
    onError: redirectToSignInOn401,
  }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});
