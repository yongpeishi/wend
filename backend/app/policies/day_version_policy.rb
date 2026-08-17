class DayVersionPolicy < ApplicationPolicy
  class Scope < ApplicationPolicy::Scope
    # A version carries no trip_id of its own, so authority comes through its
    # day -- which is what makes the id-only routes (POST keep/restore, DELETE)
    # safe: they resolve the trip off the row rather than trusting the path.
    def resolve
      scope.where(trip_day_id: TripDay.where(trip_id: visible_entries).select(:id))
    end
  end

  # Forking, keeping, restoring and archiving a plan are all edits to the day.
  def keep?    = write?
  def restore? = write?
end
