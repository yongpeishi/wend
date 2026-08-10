import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { Feedback, FeedbackWritePayload } from './types';

/** Your own past submissions, newest first. The API scopes this to the caller. */
export function useFeedbacks(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.feedback.list(),
    queryFn: () => api.get<{ feedbacks: Feedback[] }>('/feedbacks').then((r) => r.feedbacks),
    enabled: options.enabled ?? true,
  });
}

export function useCreateFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (feedback: FeedbackWritePayload) =>
      api.post<{ feedback: Feedback }>('/feedbacks', { feedback }).then((r) => r.feedback),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all }),
  });
}
