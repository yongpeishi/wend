class EntryPolicy < ApplicationPolicy
  # Only the owner may set a trip aside, because that hides it from everyone else on
  # it. Every other kind is ordinary content: anyone who can write may archive it.
  def destroy?
    record.trip? ? manage? : write?
  end

  def restore? = destroy?

  # Setting aside is reversible, so any member may do it. This is not, so it needs
  # either authorship or ownership. `write?` on the creator branch is the floor: a
  # member later demoted to viewer does not keep a destroy verb on their old work.
  #
  # A trip has no authorship fallback -- trip access has exactly one authority, a
  # membership row (see Entry#role_for) -- so a trip answers to its owner alone.
  #
  # created_by_id is read straight off the record rather than folded into the role
  # because role_for has no created_by branch for an entry inside a trip; its
  # fallback fires only for entries that hang under no trip at all.
  def destroy_permanently?
    return manage? if record.trip?

    manage? || (record.created_by_id == user&.id && write?)
  end

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
