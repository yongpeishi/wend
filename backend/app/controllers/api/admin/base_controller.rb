module Api
  module Admin
    # Everything under /api/admin inherits from here. require_login! (inherited)
    # runs first and halts signed-out requests at 401; this adds the second door:
    # a signed-in non-admin gets a flat 403. Unlike trip-scoped resources -- where
    # a 403 would confirm an id exists -- admin routes address no guessable record,
    # so the honest status is the right one.
    #
    # Both doors also open to `Authorization: Bearer <ADMIN_API_TOKEN>`, so a
    # non-interactive client can pull feedback off staging with no browser to
    # sign in from -- but only for the actions named below. With the variable
    # unset or blank the mechanism does not exist and every request meets the
    # two doors exactly as before.
    class BaseController < Api::BaseController
      # The token stands in for an admin on exactly these actions and no others --
      # an allowlist rather than "any GET", so a new route starts outside it
      # until someone decides otherwise. Both are reads; the token never writes.
      TOKEN_ACTIONS = %w[
        Api::Admin::FeedbacksController#index
        Api::Admin::FeedbacksController#export
      ].freeze

      # What the token authenticates as: not a User -- there is no row behind
      # the token, and loading one would let it act as a person. admin? is the
      # only question require_admin! and Admin::FeedbackPolicy ever ask of
      # current_user on these actions; anything else raising NoMethodError is
      # the failure mode we want for code that assumes a person.
      class TokenPrincipal
        def admin? = true
      end
      TOKEN_PRINCIPAL = TokenPrincipal.new.freeze

      before_action :require_admin!

      private

      def require_admin!
        render json: { error: "Admin access required" }, status: :forbidden unless current_user.admin?
      end

      # The session, when present, stays the identity: the token substitutes for
      # having no session at all and never upgrades a signed-in non-admin.
      def current_user
        return @current_user if defined?(@current_user)

        super || (@current_user = TOKEN_PRINCIPAL if token_authenticates_action?)
      end

      # Presence on both sides is checked before comparing: with no
      # ADMIN_API_TOKEN in the environment the door does not exist, and a blank
      # header matching a blank secret would quietly open it on every
      # unconfigured deploy. secure_compare checks bytesizes before bytes, so
      # unequal lengths are a plain false rather than a raise.
      def token_authenticates_action?
        return false unless TOKEN_ACTIONS.include?(action_key)

        secret = ENV["ADMIN_API_TOKEN"]
        presented = request.authorization.to_s[/\ABearer (.+)\z/, 1]
        secret.present? && presented.present? &&
          ActiveSupport::SecurityUtils.secure_compare(presented, secret)
      end
    end
  end
end
