class VotePolicy < ApplicationPolicy
  # Voting is a change to the trip, not a way of reading it, so a viewer cannot do
  # it -- write?, deliberately not read?.
  def create?  = write?
  def destroy? = write?

  class Scope < ApplicationPolicy::Scope
    def resolve
      scope.where(entry_id: visible_entries)
    end
  end
end
