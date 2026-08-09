/**
 * Pure helpers for the unified checklist — splitting done/open and ordering
 * the open list. No React, no fetching.
 *
 * Note on `scheduledIds`: `Todo.entry` is an `EntrySummary` (id/kind/title/
 * category only — see api/types.ts) and does not carry a `scheduled` flag,
 * so this module can't tell on its own whether a todo's parent entry is
 * scheduled. The caller (TripChecklist) fetches the trip's entries
 * separately and passes the set of scheduled entry ids in. See the frontend
 * agent's report for why — api/types.ts is out of this agent's scope.
 */
import type { EntrySummary, Todo } from '../../api/types';

export function isEntryScheduled(entry: EntrySummary | null | undefined, scheduledIds: ReadonlySet<number>): boolean {
  return entry ? scheduledIds.has(entry.id) : false;
}

export function splitDoneOpen(todos: Todo[]): { open: Todo[]; done: Todo[] } {
  return {
    open: todos.filter((t) => t.done_at === null),
    done: todos.filter((t) => t.done_at !== null),
  };
}

/**
 * Open items: due date ascending (undated last), then scheduled-entry todos
 * before unscheduled ones — "a booking for tomorrow matters more than one
 * for next week."
 */
export function sortOpenTodos(todos: Todo[], scheduledIds: ReadonlySet<number>): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.due_on !== b.due_on) {
      if (a.due_on === null) return 1;
      if (b.due_on === null) return -1;
      return a.due_on < b.due_on ? -1 : 1;
    }
    const aScheduled = isEntryScheduled(a.entry, scheduledIds);
    const bScheduled = isEntryScheduled(b.entry, scheduledIds);
    if (aScheduled !== bScheduled) return aScheduled ? -1 : 1;
    return a.id - b.id;
  });
}
