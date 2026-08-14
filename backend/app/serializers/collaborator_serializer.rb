# One person on one trip. The wire name is "collaborator", not "membership": the
# client is shown people, and the row that says so is our bookkeeping.
class CollaboratorSerializer
  class << self
    def list(memberships, current_user:, viewer_role:)
      memberships.map { |m| one(m, current_user: current_user, viewer_role: viewer_role) }
    end

    def one(membership, current_user:, viewer_role:)
      user = membership.user
      {
        "user_id" => membership.user_id,
        "name" => user&.name,
        # Everyone sees who is here. Only the people who can change the trip see
        # how to reach them -- otherwise a trip shared with a stranger hands them
        # an address book.
        "email" => reachable?(viewer_role) ? user&.email : nil,
        "role" => membership.role,
        "is_you" => membership.user_id == current_user.id,
        "added_at" => membership.created_at.iso8601
      }
    end

    private

    def reachable?(viewer_role)
      TripMembership::RANK.fetch(viewer_role, 0) >= TripMembership::RANK.fetch("member")
    end
  end
end
