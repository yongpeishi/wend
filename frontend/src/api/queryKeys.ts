import type { EntriesQuery, NearbyQuery, TodosQuery } from './types';

/** Central query-key factory so invalidations stay consistent across hooks. */
export const queryKeys = {
  session: ['session'] as const,
  entries: {
    all: ['entries'] as const,
    list: (query?: EntriesQuery) => ['entries', 'list', query ?? {}] as const,
    detail: (id: number) => ['entries', 'detail', id] as const,
    tree: (id: number, depth?: number) => ['entries', 'tree', id, depth ?? null] as const,
  },
  todos: {
    all: ['todos'] as const,
    list: (query?: TodosQuery) => ['todos', 'list', query ?? {}] as const,
  },
  schedule: {
    all: ['schedule'] as const,
    day: (tripId: number, day?: string) => ['schedule', tripId, day ?? null] as const,
  },
  itinerary: {
    all: ['itinerary'] as const,
    trip: (tripId: number) => ['itinerary', tripId] as const,
  },
  nearby: (tripId: number, query: NearbyQuery) => ['nearby', tripId, query] as const,
  feedback: {
    all: ['feedback'] as const,
    list: () => ['feedback', 'list'] as const,
  },
};
