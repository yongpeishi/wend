# Permission is resolved from the entries a record hangs off, never re-derived per
# model. Subclasses exist only to tighten a verb.
class ApplicationPolicy
  attr_reader :user, :record

  def initialize(user, record)
    @user = user
    @record = record
  end

  def show?    = read?
  def create?  = write?
  def update?  = write?
  def destroy? = write?

  def read?
    role.present?
  end

  def write?
    TripMembership::RANK.fetch(role, 0) >= TripMembership::RANK.fetch("member")
  end

  def manage?
    role == "owner"
  end

  # Conjunction across governing entries: the weakest wins, and any unreadable one
  # denies outright.
  def role
    return @role if defined?(@role)

    roles = Entry.where(id: record.governing_entry_ids).map { |e| e.role_for(user) }
    @role =
      if roles.any? && roles.all?(&:present?)
        roles.min_by { |r| TripMembership::RANK.fetch(r, 0) }
      end
  end

  class Scope
    attr_reader :user, :scope

    def initialize(user, scope)
      @user = user
      @scope = scope
    end

    def resolve
      raise NotImplementedError
    end

    private

    # The one visibility answer every scope below narrows to. Left as a relation,
    # not a pluck, so it composes as an IN subquery instead of a round trip.
    def visible_entries
      Entry.visible_to(user).select(:id)
    end
  end
end
