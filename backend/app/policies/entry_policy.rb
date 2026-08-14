class EntryPolicy < ApplicationPolicy
  # Only the owner may set a trip aside, because that hides it from everyone else on
  # it. Every other kind is ordinary content: anyone who can write may archive it.
  def destroy?
    record.trip? ? manage? : write?
  end

  def restore? = destroy?
  def tree?    = read?
  def lift?    = write?
  def fork?    = write?
  # absorb needs owner on BOTH trips; the second check lives in the controller.
  def absorb?  = manage?
  def share?   = write?
  # Viewers do not vote -- see the contract, "out of scope".
  def vote?    = write?

  # A brand new row governs nothing yet, so there is nothing to resolve a role
  # against. Where the entry will hang under a parent the controller authorizes the
  # parent instead; with no parent it is a library entry, which belongs to whoever
  # is making it.
  def create?
    record.is_a?(Entry) && record.new_record? ? user.present? : write?
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      scope.visible_to(user)
    end
  end
end
