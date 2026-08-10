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

function useInvalidateSchedule() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
}

export function useCreateScheduleItem(tripId: number) {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: (item: ScheduleItemWritePayload & { day: string }) =>
      api.post<{ schedule_item: ScheduleItem }>(`/trips/${tripId}/schedule`, { schedule_item: item }).then((r) => r.schedule_item),
    onSuccess: invalidate,
  });
}

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
