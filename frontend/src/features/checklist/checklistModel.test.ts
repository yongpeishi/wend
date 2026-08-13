import { describe, expect, it } from 'vitest';
import { isEntryScheduled, sortOpenTodos, splitDoneOpen } from './checklistModel';
import type { Todo } from '../../api/types';

function makeTodo(overrides: Partial<Todo>): Todo {
  return {
    id: 1,
    title: 'Untitled',
    entry_id: null,
    trip_id: null,
    done_at: null,
    due_on: null,
    position: 0,
    ...overrides,
  };
}

describe('splitDoneOpen', () => {
  it('separates done from open by done_at', () => {
    const todos = [makeTodo({ id: 1, done_at: null }), makeTodo({ id: 2, done_at: '2026-01-01T00:00:00Z' })];
    const { open, done } = splitDoneOpen(todos);
    expect(open.map((t) => t.id)).toEqual([1]);
    expect(done.map((t) => t.id)).toEqual([2]);
  });
});

describe('sortOpenTodos', () => {
  it('sorts by due date ascending, undated last', () => {
    const todos = [
      makeTodo({ id: 1, due_on: null }),
      makeTodo({ id: 2, due_on: '2026-12-01' }),
      makeTodo({ id: 3, due_on: '2026-10-01' }),
    ];
    expect(sortOpenTodos(todos, new Set()).map((t) => t.id)).toEqual([3, 2, 1]);
  });

  it('breaks a due-date tie in favour of the todo whose entry is scheduled', () => {
    const todos = [
      makeTodo({ id: 1, due_on: '2026-11-05', entry: { id: 10, kind: 'idea', title: 'Onsen', category: 'activity', duration_minutes: null, location_name: null } }),
      makeTodo({ id: 2, due_on: '2026-11-05', entry: { id: 11, kind: 'idea', title: 'Ryokan', category: 'lodging', duration_minutes: null, location_name: null } }),
    ];
    // Only entry 11 (Ryokan) is scheduled — its todo should sort first despite a tied due date.
    expect(sortOpenTodos(todos, new Set([11])).map((t) => t.id)).toEqual([2, 1]);
  });

  it('treats trip-level todos (no entry) as unscheduled for the tiebreak', () => {
    const todos = [
      makeTodo({ id: 1, due_on: '2026-11-05' }),
      makeTodo({ id: 2, due_on: '2026-11-05', entry: { id: 11, kind: 'idea', title: 'Ryokan', category: 'lodging', duration_minutes: null, location_name: null } }),
    ];
    expect(sortOpenTodos(todos, new Set([11])).map((t) => t.id)).toEqual([2, 1]);
  });
});

describe('isEntryScheduled', () => {
  it('is false for a null entry', () => {
    expect(isEntryScheduled(null, new Set([1]))).toBe(false);
  });
  it('checks membership in the scheduled id set', () => {
    expect(isEntryScheduled({ id: 1, kind: 'idea', title: 'x', category: null, duration_minutes: null, location_name: null }, new Set([1]))).toBe(true);
    expect(isEntryScheduled({ id: 2, kind: 'idea', title: 'x', category: null, duration_minutes: null, location_name: null }, new Set([1]))).toBe(false);
  });
});
