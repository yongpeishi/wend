class ScheduleItemPolicy < ApplicationPolicy
  class Scope < ApplicationPolicy::Scope
    # The trip alone, matching ScheduleItem#governing_entry_ids. This is what makes
    # PATCH /api/schedule_items/:id safe: the route carries no trip_id, so authority
    # has to come off the row.
    def resolve
      scope.where(trip_id: visible_entries)
    end
  end
end
