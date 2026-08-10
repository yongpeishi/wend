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
    onSuccess: () => queryClient.setQueryData(queryKeys.session, null),
  });
}
