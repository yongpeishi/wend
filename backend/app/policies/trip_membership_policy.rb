# A membership row is not Governed. It *is* the authority every other policy
# resolves against, so there is nothing to look a role up from except the trip it
# names -- which is also why `role` is overridden rather than inherited.
class TripMembershipPolicy < ApplicationPolicy
  # Bringing someone along is a change to the trip, so member and up. A viewer
  # reads the list and adds nobody.
  def create? = write?

  # Only the owner says what someone else may do, and never about themselves: the
  # owner row is the one the trip cannot be without. Since there is exactly one
  # owner per trip, `record.role == "owner"` is the caller's own row.
  def update? = manage? && record.role != "owner"

  # The owner may take anyone off; everyone else may only leave. The owner is
  # never taken off by anybody, themselves included -- hand the trip over first,
  # which leaves the trip with an owner at every instant.
  def destroy?
    return false if record.role == "owner"

    manage? || record.user_id == user.id
  end

  def hand_over? = manage?

  def role
    return @role if defined?(@role)

    @role = record.trip&.role_for(user)
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      scope.where(trip_id: visible_entries)
    end
  end
end
