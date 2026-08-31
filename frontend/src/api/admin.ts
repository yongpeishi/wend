import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { AdminFeedback, FeedbackStatus } from './types';

/**
 * The CSV download. A plain navigation, not an api.get: the response is a file
 * with a Content-Disposition, and the session cookie rides along on its own —
 * `window.location.assign(adminFeedbackExportUrl(...))` is the whole client.
 */
export const ADMIN_FEEDBACK_EXPORT_URL = '/api/admin/feedbacks/export';

/**
 * The download URL for what is currently on screen. The narrowing is a query
 * param rather than a client-side filter of the rows, because the file is the
 * server's — it holds a column (`user_agent`) the table never receives, so the
 * browser has nothing to filter with.
 *
 * `status[]` repeated, the shape Rails reads straight into an array, so the
 * server can apply the same set the chips did. No statuses is no narrowing:
 * an untouched filter downloads the whole pile, which is what the button did
 * before there was a filter at all.
 */
export function adminFeedbackExportUrl(statuses: readonly FeedbackStatus[]): string {
  if (statuses.length === 0) return ADMIN_FEEDBACK_EXPORT_URL;
  const params = new URLSearchParams();
  for (const status of statuses) params.append('status[]', status);
  return `${ADMIN_FEEDBACK_EXPORT_URL}?${params}`;
}

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

/**
 * DELETE /api/admin/feedbacks/:id — gone for good, screenshots and all. The
 * server only takes this for done or rejected feedback and answers 204.
 *
 * Not optimistic, unlike the status change above: a delete stands behind a
 * confirm dialog, so there is no control snapping back mid-request to paper
 * over — the invalidation's refetch is all the UI needs.
 */
export function useDeleteAdminFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/admin/feedbacks/${id}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });
}
