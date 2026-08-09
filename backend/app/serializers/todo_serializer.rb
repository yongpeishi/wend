class TodoSerializer
  class << self
    # with_entry: true attaches an `entry` summary -- the EntrySummary of the
    # entry the todo hangs off, or of the trip itself for trip-level todos.
    # Used by the unified checklist view (GET /api/todos?trip_id=X).
    def list(todos, with_entry: false)
      todos = Array(todos)
      return todos.map { |t| one(t) } unless with_entry

      ids = (todos.map(&:entry_id) + todos.map(&:trip_id)).compact.uniq
      entries_by_id = Entry.where(id: ids).index_by(&:id)

      todos.map do |todo|
        attached = todo.entry_id ? entries_by_id[todo.entry_id] : entries_by_id[todo.trip_id]
        one(todo).merge("entry" => attached ? EntrySerializer.summary(attached) : nil)
      end
    end

    def one(todo)
      {
        "id" => todo.id,
        "title" => todo.title,
        "entry_id" => todo.entry_id,
        "trip_id" => todo.trip_id,
        "done_at" => todo.done_at&.iso8601,
        "due_on" => todo.due_on&.iso8601,
        "position" => todo.position,
        "created_at" => todo.created_at.iso8601,
        "updated_at" => todo.updated_at.iso8601
      }
    end
  end
end
