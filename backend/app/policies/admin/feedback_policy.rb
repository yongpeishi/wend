# The admin view of feedback: every submission, readable and triageable, but only
# by an admin. Overriding the three primitives (as FeedbackPolicy does) keeps the
# entry-role machinery out of reach; `Admin::BaseController#require_admin!` already
# turns non-admins away, so these checks are defense in depth behind it.
module Admin
  class FeedbackPolicy < ApplicationPolicy
    def read?   = admin?
    def write?  = admin?
    def manage? = admin?

    # `export` has no ApplicationPolicy verb to map through, so it is named here.
    def export? = admin?

    class Scope < ApplicationPolicy::Scope
      def resolve
        scope.all
      end
    end

    private

    def admin?
      user.admin?
    end
  end
end
