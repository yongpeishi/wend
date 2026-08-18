import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { Todo, TodosQuery, TodoWritePayload } from './types';

export function useTodos(query?: TodosQuery) {
  return useQuery({
    queryKey: queryKeys.todos.list(query),
    queryFn: () => api.get<{ todos: Todo[] }>('/todos', { params: { ...query } }).then((r) => r.todos),
  });
}

/**
 * Refetch the to-do lists AND the entries, after every to-do write.
 *
 * The entries half is not incidental: `todos_open_count` is a field on `Entry`,
 * served by the *entries* endpoint, not by `/todos`. Ticking one to-do
 * therefore changes data that only an entries refetch can see, and on the board
 * it drives two visible things — the "N open" text in an idea row's meta line,
 * and the row's state dot, which `ideaState()` reads straight off
 * `todos_open_count`. The bundle card sums the same field across its members.
 * Without this the checkbox updates and the count beside it stays wrong until a
 * reload. Nothing in this file shows that, so: do not drop it as redundant.
 */
function useInvalidateTodos() {
  const queryClient = useQueryClient();
  // Both promises are awaited together, as the single-key version was awaited
  // before: `onSuccess` returning a promise keeps the mutation pending until
  // the refetches land, so a caller that awaits the mutation still sees fresh
  // counts.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.todos.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.entries.all }),
    ]);
}

export function useCreateTodo() {
  const invalidate = useInvalidateTodos();
  return useMutation({
    mutationFn: (todo: TodoWritePayload) => api.post<{ todo: Todo }>('/todos', { todo }).then((r) => r.todo),
    onSuccess: invalidate,
  });
}

export function useUpdateTodo(id: number) {
  const invalidate = useInvalidateTodos();
  return useMutation({
    mutationFn: (todo: TodoWritePayload) => api.patch<{ todo: Todo }>(`/todos/${id}`, { todo }).then((r) => r.todo),
    onSuccess: invalidate,
  });
}

export function useDeleteTodo() {
  const invalidate = useInvalidateTodos();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/todos/${id}`),
    onSuccess: invalidate,
  });
}
