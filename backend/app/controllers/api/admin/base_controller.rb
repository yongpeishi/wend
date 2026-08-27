module Api
  module Admin
    # Everything under /api/admin inherits from here. require_login! (inherited)
    # runs first and halts signed-out requests at 401; this adds the second door:
    # a signed-in non-admin gets a flat 403. Unlike trip-scoped resources -- where
    # a 403 would confirm an id exists -- admin routes address no guessable record,
    # so the honest status is the right one.
    class BaseController < Api::BaseController
      before_action :require_admin!

      private

      def require_admin!
        render json: { error: "Admin access required" }, status: :forbidden unless current_user.admin?
      end
    end
  end
end
