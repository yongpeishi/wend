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

/**
 * The screenshot limits, enforced identically on the server. They live here
 * rather than in the composer because the mock handlers mirror them too: one
 * set of numbers means mock mode rejects exactly what production rejects, and
 * a limit that moves moves in one place. Checking them before the request is a
 * courtesy — the server's 422 is the authority — but it is the difference
 * between "too big" told instantly and told after a 20 MB upload.
 */
export const FEEDBACK_SCREENSHOT_MAX_COUNT = 5;
export const FEEDBACK_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_SCREENSHOT_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/**
 * The multipart body: `feedback[...]` field names, because Rails reads nested
 * params out of bracketed keys the same way whether they arrived as JSON or as
 * form parts, so the controller needs no second code path.
 *
 * Optional fields that are null or undefined are skipped rather than sent.
 * FormData coerces every value with String(), so setting an absent `url` would
 * post the literal seven characters "undefined" and the report would come back
 * claiming to have been filed from a page of that name.
 */
export function buildFeedbackFormData(payload: FeedbackWritePayload): FormData {
  const form = new FormData();
  form.set('feedback[message]', payload.message);
  for (const field of ['url', 'element_selector', 'element_classes'] as const) {
    const value = payload[field];
    if (value !== null && value !== undefined) form.set(`feedback[${field}]`, value);
  }
  for (const file of payload.screenshots ?? []) {
    form.append('feedback[screenshots][]', file);
  }
  return form;
}

/**
 * POST /api/feedbacks, in whichever of the two encodings the payload calls for.
 *
 * A report with no images stays JSON, byte for byte what it has always been:
 * multipart is strictly more expensive to build and to parse, and the great
 * majority of reports are a sentence and a URL. Files force the switch because
 * JSON has no way to carry them that isn't base64 in a string.
 *
 * `screenshots` is dropped from the JSON body rather than left to
 * JSON.stringify: an empty array would serialize as `"screenshots":[]`, a key
 * the JSON branch of the contract does not have.
 */
export function useCreateFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ screenshots, ...fields }: FeedbackWritePayload) =>
      (screenshots && screenshots.length > 0
        ? api.postForm<{ feedback: Feedback }>('/feedbacks', buildFeedbackFormData({ ...fields, screenshots }))
        : api.post<{ feedback: Feedback }>('/feedbacks', { feedback: fields })
      ).then((r) => r.feedback),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all }),
  });
}
