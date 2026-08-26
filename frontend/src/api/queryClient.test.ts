import { afterEach, describe, expect, it } from 'vitest';
import { MutationObserver } from '@tanstack/react-query';
import { ApiError } from './client';
import { queryClient } from './queryClient';
import { queryKeys } from './queryKeys';
import type { User } from './types';

// The mid-session expiry seam. The session query is cached with
// staleTime: Infinity, so when the cookie dies mid-use nothing re-checks it —
// the app-wide onError handlers are the only thing that turns "every request
// now 401s" into `session: null`, which is what makes ProtectedRoute redirect
// to /signin instead of leaving the user on silently-empty screens.

const user: User = { id: 1, name: 'Demo Traveler', email: 'demo@wend.app', admin: true };

const unauthorized = () => Promise.reject(new ApiError(401, 'Session expired'));
const serverError = () => Promise.reject(new ApiError(500, 'Boom'));

// The module-level client is shared across tests; leave nothing behind.
afterEach(() => queryClient.clear());

describe('queryClient 401 handling', () => {
  it('nulls the session when any query fails with 401', async () => {
    queryClient.setQueryData(queryKeys.session, user);

    await expect(
      queryClient.fetchQuery({ queryKey: queryKeys.entries.list(), queryFn: unauthorized, retry: false }),
    ).rejects.toMatchObject({ status: 401 });

    expect(queryClient.getQueryData<User | null>(queryKeys.session)).toBeNull();
  });

  it('nulls the session when any mutation fails with 401', async () => {
    queryClient.setQueryData(queryKeys.session, user);
    const observer = new MutationObserver(queryClient, { mutationFn: unauthorized });

    await expect(observer.mutate()).rejects.toMatchObject({ status: 401 });

    expect(queryClient.getQueryData<User | null>(queryKeys.session)).toBeNull();
  });

  it('leaves the session alone on non-401 failures', async () => {
    queryClient.setQueryData(queryKeys.session, user);

    await expect(
      queryClient.fetchQuery({ queryKey: queryKeys.entries.list(), queryFn: serverError, retry: false }),
    ).rejects.toMatchObject({ status: 500 });

    expect(queryClient.getQueryData<User | null>(queryKeys.session)).toBe(user);
  });

  it('is harmless when the session is already signed out', async () => {
    // The failed-sign-in path: POST /session -> 401 lands in the mutation
    // handler while /signin already shows a null session. The write-back must
    // not disturb that — SignIn's own catch keeps the error message.
    queryClient.setQueryData(queryKeys.session, null);
    const observer = new MutationObserver(queryClient, { mutationFn: unauthorized });

    await expect(observer.mutate()).rejects.toMatchObject({ status: 401 });

    expect(queryClient.getQueryData<User | null>(queryKeys.session)).toBeNull();
  });
});
