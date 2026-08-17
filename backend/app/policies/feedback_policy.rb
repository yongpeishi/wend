# Feedback is about the app, not about a trip: it belongs to a user directly and
# does not include Governed, so none of the entry-based role logic applies to it.
# Overriding the three primitives rather than the verbs keeps `role` -- which would
# ask a Feedback for governing entries it does not have -- out of reach entirely.
#
# This is exactly what the controller already did by hand before Pundit arrived:
# your own submissions, and nobody else's.
class FeedbackPolicy < ApplicationPolicy
  def read?   = own?
  def write?  = own?
  def manage? = own?

  class Scope < ApplicationPolicy::Scope
    def resolve
      scope.where(user_id: user.id)
    end
  end

  private

  def own?
    record.user_id == user.id
  end
end
