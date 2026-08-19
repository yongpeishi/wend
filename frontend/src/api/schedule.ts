import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { ScheduleItem, ScheduleItemWritePayload } from './types';

export function useSchedule(tripId: number | undefined, day?: string) {
  return useQuery({
    queryKey: queryKeys.schedule.day(tripId ?? -1, day),
    queryFn: () =>
      api
        .get<{ schedule_items: ScheduleItem[] }>(`/trips/${tripId}/schedule`, { params: { day } })
        .then((r) => r.schedule_items),
    enabled: tripId !== undefined,
  });
}

/**
 * Schedule items are the itinerary's rows too, read through a different
 * endpoint — so writing one has to invalidate both screens' queries, or the
 * itinerary keeps showing a day that no longer has that item on it.
 *
 * Entries are invalidated as well: the server computes `scheduled` on every
 * Entry from its schedule items, so placing or removing an item changes data
 * the entries queries own (the Structure tree's dot, BundleCard member dots).
 * Without this the flag stays stale until a reload.
 */
function useInvalidateSchedule() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.itinerary.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
  };
}

/**
 * `item` may carry `day_version_id` to place the item in a named version of
 * the day. Left out, the server resolves it to that day's first live version,
 * creating the day and its "Version A" if this is the first thing on it —
 * which is what the pre-itinerary callers (TripSchedule.tsx) rely on.
 */
export function useCreateScheduleItem(tripId: number) {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: (item: ScheduleItemWritePayload & { day: string }) =>
      api.post<{ schedule_item: ScheduleItem }>(`/trips/${tripId}/schedule`, { schedule_item: item }).then((r) => r.schedule_item),
    onSuccess: invalidate,
  });
}

/**
 * Also accepts `day_version_id`. Changing `day` without naming one moves the
 * item to the new date's first live version.
 */
export function useUpdateScheduleItem(id: number) {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: (item: ScheduleItemWritePayload) =>
      api.patch<{ schedule_item: ScheduleItem }>(`/schedule_items/${id}`, { schedule_item: item }).then((r) => r.schedule_item),
    onSuccess: invalidate,
  });
}

export function useDeleteScheduleItem() {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/schedule_items/${id}`),
    onSuccess: invalidate,
  });
}

/** Minutes-from-midnight -> "HH:MM", 24-hour, per architecture.md §2. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '';
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}
