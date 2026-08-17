class TodoPolicy < ApplicationPolicy
  # A todo naming neither a trip nor an entry has nothing to be permitted against.
  # The model rejects it, which is a 422 about a malformed body -- not a permission
  # question, and not something to answer with a 404.
  def create?
    record.governing_entry_ids.empty? || write?
  end

  class Scope < ApplicationPolicy::Scope
    # The same conjunction as Todo#governing_entry_ids, expressed as SQL: a todo hung
    # off both a trip and an entry needs both visible. A NULL side names no entry and
    # so constrains nothing.
    def resolve
      visible = visible_entries.to_sql
      scope.where("todos.trip_id IS NULL OR todos.trip_id IN (#{visible})")
           .where("todos.entry_id IS NULL OR todos.entry_id IN (#{visible})")
    end
  end
end
