import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { AdminFeedback, FeedbackStatus } from './types';

/**
 * The CSV download. A plain navigation, not an api.get: the response is a file
 * with a Content-Disposition, and the session cookie rides along on its own —
 * `window.location.assign(ADMIN_FEEDBACK_EXPORT_URL)` is the whole client.
 */
export const ADMIN_FEEDBACK_EXPORT_URL = '/api/admin/feedbacks/export';

/** Everyone's feedback, newest first. Admin only — the API answers 403 otherwise. */
export function useAdminFeedbacks() {
  return useQuery({
    queryKey: queryKeys.admin.feedbacks(),
    queryFn: () => api.get<{ feedbacks: AdminFeedback[] }>('/admin/feedbacks').then((r) => r.feedbacks),
  });
}

/**
 * PATCH /api/admin/feedbacks/:id — triage. `status` is all an admin may change.
 *
 * Optimistic, the votes idiom: the row's status select is controlled from the
 * cache, so without the onMutate write it would snap back to the old value for
 * the length of the request. Rolled back on error; the invalidation afterwards
 * is the refetch that matters most exactly when the write failed.
 */
export function useUpdateAdminFeedbackStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: FeedbackStatus }) =>
      api
        .patch<{ feedback: AdminFeedback }>(`/admin/feedbacks/${id}`, { feedback: { status } })
        .then((r) => r.feedback),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.admin.feedbacks() });
      const previous = queryClient.getQueryData<AdminFeedback[]>(queryKeys.admin.feedbacks());
      queryClient.setQueryData<AdminFeedback[]>(queryKeys.admin.feedbacks(), (rows) =>
        rows?.map((row) => (row.id === id ? { ...row, status } : row)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.admin.feedbacks(), context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });
}
