import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './client';
import { queryKeys } from './queryKeys';
import type { User } from './types';

/** GET /api/me — 401 (not signed in) is a normal, non-error result here. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: async () => {
      try {
        const { user } = await api.get<{ user: User }>('/me');
        return user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api.post<{ user: User }>('/session', credentials).then((r) => r.user),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.session, user),
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; email: string; password: string }) =>
      api.post<{ user: User }>('/users', params).then((r) => r.user),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.session, user),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>('/session'),
    // Signing out has to empty the whole cache, not just the session key:
    // otherwise the next traveller to sign in on this browser sees the previous
    // one's trips and ideas render straight from memory. The order matters.
    // 1. Cancel first — an in-flight request that resolved after the clear
    //    would repopulate the cache with the signed-out user's data.
    // 2. Clear everything: entries, todos, schedule, itinerary, nearby, feedback.
    // 3. Re-seed `session: null` immediately. `useMe` has staleTime: Infinity,
    //    so a seeded null stops it firing a fresh GET /api/me and stops
    //    ProtectedRoute flashing its spinner on the way to /signin.
    // A failed sign out never reaches here, so the cache is left untouched.
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(queryKeys.session, null);
    },
  });
}
