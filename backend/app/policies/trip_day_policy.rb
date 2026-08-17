class TripDayPolicy < ApplicationPolicy
  class Scope < ApplicationPolicy::Scope
    # The trip alone, matching TripDay#governing_entry_ids.
    def resolve
      scope.where(trip_id: visible_entries)
    end
  end
end
