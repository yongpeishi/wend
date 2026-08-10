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

function useInvalidateTodos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
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
