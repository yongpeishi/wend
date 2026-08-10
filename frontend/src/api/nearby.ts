import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { Entry, NearbyQuery } from './types';

/** "I have free time here, what's nearby but unscheduled" — GET /api/trips/:trip_id/nearby. */
export function useNearby(tripId: number | undefined, query: NearbyQuery) {
  return useQuery({
    queryKey: queryKeys.nearby(tripId ?? -1, query),
    queryFn: () => api.get<{ entries: Entry[] }>(`/trips/${tripId}/nearby`, { params: { ...query } }).then((r) => r.entries),
    enabled: tripId !== undefined,
  });
}
