import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { AddCollaboratorPayload, Collaborator, CollaboratorsResponse, TripRole } from './types';

/** The two roles that can be handed out. A second owner is not a thing you can
 * make — `hand_over` moves the one there is. */
export type GrantableRole = Exclude<TripRole, 'owner'>;

function useInvalidateCollaborators() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.collaborators.all });
}

/**
 * Who is on a trip is also part of what an entry says about itself:
 * `collaborators_count` on the detail, and `my_role` on the trip in a list. So
 * anything that adds someone, takes someone off, or moves the caller's own role
 * invalidates the entry cache alongside the collaborator one.
 *
 * A plain role change does not — it moves someone else, never the caller, and
 * the count is unchanged.
 */
function useInvalidateCollaboratorsAndEntries() {
  const queryClient = useQueryClient();
  const invalidateCollaborators = useInvalidateCollaborators();
  return async () => {
    await invalidateCollaborators();
    await queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
  };
}

/** GET /api/trips/:trip_id/collaborators — the list plus your own role on it. */
export function useCollaborators(tripId: number, options?: Partial<UseQueryOptions<CollaboratorsResponse>>) {
  return useQuery({
    queryKey: queryKeys.collaborators.list(tripId),
    queryFn: () => api.get<CollaboratorsResponse>(`/trips/${tripId}/collaborators`),
    ...options,
  });
}

/**
 * POST /api/trips/:trip_id/collaborators — 202 `{ status: "accepted" }` whether
 * the address matched somebody, matched nobody, matched somebody already here,
 * or matched you. There is deliberately nothing in the reply to branch on, so
 * callers must not try: the one answer they can give the user is the same one.
 */
export function useAddCollaborator(tripId: number) {
  const invalidate = useInvalidateCollaboratorsAndEntries();
  return useMutation({
    mutationFn: (payload: AddCollaboratorPayload) =>
      api.post<{ status: string }>(`/trips/${tripId}/collaborators`, payload),
    onSuccess: invalidate,
  });
}

/** PATCH /api/trips/:trip_id/collaborators/:user_id — owner only. */
export function useChangeCollaboratorRole(tripId: number) {
  const invalidate = useInvalidateCollaborators();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: GrantableRole }) =>
      api
        .patch<{ collaborator: Collaborator }>(`/trips/${tripId}/collaborators/${userId}`, { role })
        .then((r) => r.collaborator),
    onSuccess: invalidate,
  });
}

/** DELETE /api/trips/:trip_id/collaborators/:user_id — 204. The owner may take
 * anyone off; everyone else may only leave. */
export function useRemoveCollaborator(tripId: number) {
  const invalidate = useInvalidateCollaboratorsAndEntries();
  return useMutation({
    mutationFn: (userId: number) => api.delete<void>(`/trips/${tripId}/collaborators/${userId}`),
    onSuccess: invalidate,
  });
}

/**
 * POST /api/trips/:trip_id/collaborators/:user_id/hand_over — answers with the
 * whole GET body, because the caller has just become a member and the list they
 * are looking at is already out of date.
 */
export function useHandOverTrip(tripId: number) {
  const invalidate = useInvalidateCollaboratorsAndEntries();
  return useMutation({
    mutationFn: (userId: number) =>
      api.post<CollaboratorsResponse>(`/trips/${tripId}/collaborators/${userId}/hand_over`),
    onSuccess: invalidate,
  });
}
