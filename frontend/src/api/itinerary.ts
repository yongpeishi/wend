import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { TripDay, TripDayWritePayload } from './types';

/**
 * The itinerary screen's data seam — CONTRACT §3.
 *
 * Every mutation here answers with the whole affected `TripDay`, so each one
 * writes that day straight into the `useItinerary` cache by date instead of
 * refetching (no window where the screen shows the pre-mutation day). They
 * also invalidate the schedule queries: the final-schedule screen reads the
 * same `schedule_items` rows from a different endpoint, and forking or keeping
 * changes what it would show.
 */
export function useItinerary(tripId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.itinerary.trip(tripId ?? -1),
    queryFn: () => api.get<{ trip_days: TripDay[] }>(`/trips/${tripId}/itinerary`).then((r) => r.trip_days),
    enabled: tripId !== undefined,
  });
}

/**
 * Replaces one day in the cached list, matching on `day` — a day that had no
 * row yet (the server creates one on demand) is inserted in date order. An
 * uncached list is left alone: half a list is worse than none, and the query
 * will fetch the whole thing.
 */
function useApplyTripDay(tripId: number) {
  const queryClient = useQueryClient();
  return (tripDay: TripDay) => {
    queryClient.setQueryData<TripDay[]>(queryKeys.itinerary.trip(tripId), (days) => {
      if (!days) return days;
      const index = days.findIndex((d) => d.day === tripDay.day);
      if (index === -1) return [...days, tripDay].sort((a, b) => a.day.localeCompare(b.day));
      const next = days.slice();
      next[index] = tripDay;
      return next;
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
  };
}

/** Sets or clears a day's lodging. Sending both keys as null clears it. */
export function useUpdateTripDay(tripId: number) {
  const applyTripDay = useApplyTripDay(tripId);
  return useMutation({
    mutationFn: ({ day, ...trip_day }: TripDayWritePayload & { day: string }) =>
      api.patch<{ trip_day: TripDay }>(`/trips/${tripId}/days/${day}`, { trip_day }).then((r) => r.trip_day),
    onSuccess: applyTripDay,
  });
}

/** Copies the day's last live version into a new one — "Version B", "Version C". */
export function useForkDay(tripId: number) {
  const applyTripDay = useApplyTripDay(tripId);
  return useMutation({
    mutationFn: ({ day }: { day: string }) =>
      api.post<{ trip_day: TripDay }>(`/trips/${tripId}/days/${day}/versions`).then((r) => r.trip_day),
    onSuccess: applyTripDay,
  });
}

/** Settles the day on one version, archiving (never deleting) its siblings. */
export function useKeepVersion(tripId: number) {
  const applyTripDay = useApplyTripDay(tripId);
  return useMutation({
    mutationFn: ({ versionId }: { versionId: number }) =>
      api.post<{ trip_day: TripDay }>(`/day_versions/${versionId}/keep`).then((r) => r.trip_day),
    onSuccess: applyTripDay,
  });
}

/** Brings an archived version back, appended with the next free letter. */
export function useRestoreVersion(tripId: number) {
  const applyTripDay = useApplyTripDay(tripId);
  return useMutation({
    mutationFn: ({ versionId }: { versionId: number }) =>
      api.post<{ trip_day: TripDay }>(`/day_versions/${versionId}/restore`).then((r) => r.trip_day),
    onSuccess: applyTripDay,
  });
}

/** Archives a version. Rejected with a 422 when it is the day's last live one. */
export function useArchiveVersion(tripId: number) {
  const applyTripDay = useApplyTripDay(tripId);
  return useMutation({
    mutationFn: ({ versionId }: { versionId: number }) =>
      api.delete<{ trip_day: TripDay }>(`/day_versions/${versionId}`).then((r) => r.trip_day),
    onSuccess: applyTripDay,
  });
}
