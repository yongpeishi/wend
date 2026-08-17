module Api
  # Who is on a trip. trip_memberships is the single authority on trip access, so
  # this is the only place rows are written to it by hand -- everything else in the
  # app reads them through Entry.visible_to and the policies.
  class CollaboratorsController < Api::BaseController
    # No second owner is ever minted: hand_over moves the one there is.
    GRANTABLE_ROLES = %w[member viewer].freeze

    # The one rule the whole feature hangs off. A trip with no owner is invisible to
    # everyone and nothing here is hard-deleted, so it would linger unreachable.
    OWNER_IS_STUCK = "You started this trip, so it needs you until someone else takes it on.".freeze

    # Denials here are 403 with a sentence, not the 404 the rest of the API answers.
    # The difference is what the caller already knows: they got past set_trip, so the
    # trip is plainly visible to them and refusing out loud reveals nothing. A 404
    # would only leave them wondering whether the trip had vanished.
    REFUSALS = {
      "create?" => "You can read this trip, but not bring people onto it.",
      "update?" => "Only the person who started this trip can change what people can do.",
      "destroy?" => "Only the person who started this trip can take someone off it.",
      "hand_over?" => "Only the person who started this trip can hand it on."
    }.freeze

    # Declared after ApplicationController's, so it wins for this controller only.
    rescue_from Pundit::NotAuthorizedError, with: :render_refusal

    before_action :set_trip
    before_action :set_membership, only: [ :update, :destroy, :hand_over ]

    def index
      render json: collaborators_body
    end

    # Answers 202 {"status":"accepted"} whether the address belongs to somebody,
    # nobody, somebody already here, or you. The reply must not say which, or it
    # becomes a way to ask whether an address has an account here.
    def create
      authorize TripMembership.new(trip: @trip), :create?

      email = params[:email].to_s.strip.downcase
      role = params[:role].to_s
      errors = invitation_errors(email, role)

      if errors.any?
        # Errors say nothing about accounts: each one is either checkable without
        # asking us, or about the caller rather than the address.
        render json: { errors: errors }, status: :unprocessable_entity
      else
        # One path, not a branch that returns early: the lookup always runs and the
        # insert is guarded rather than skipped around. find_or_create_by also makes
        # "already here" a no-op -- a role change is PATCH's job, not a side effect
        # of being added twice.
        #
        # What is promised is the status and the bytes. Timing is not: adding
        # somebody really does cost a write, and an artificial sleep would make
        # timing analysis easier rather than harder while holding a thread. Parity
        # on the clock is best-effort. Reloading the list a moment later still shows
        # the person -- accepted and recorded in ADR-5, not a bug to engineer
        # around.
        target = User.find_by(email: email)
        addable = target.present? && target.id != current_user.id
        TripMembership.find_or_create_by!(trip_id: @trip.id, user_id: target.id) { |m| m.role = role } if addable

        render json: { status: "accepted" }, status: :accepted
      end
    end

    def update
      authorize @membership

      role = params[:role].to_s
      if GRANTABLE_ROLES.include?(role)
        @membership.update!(role: role)
        render json: { collaborator: CollaboratorSerializer.one(@membership, current_user: current_user, viewer_role: my_role) }
      else
        render json: { errors: { role: [ "must be member or viewer" ] } }, status: :unprocessable_entity
      end
    end

    def destroy
      authorize @membership
      # destroy!, not destroy: TripMembership's last-owner guard aborts silently, and
      # a 204 that removed nothing would be a lie. The policy refuses owner rows
      # first, so the guard is a backstop that never fires from here.
      @membership.destroy!
      head :no_content
    end

    # The only way the owner changes. Answers with the GET body rather than 204,
    # because the caller's own role has just become "member" and the list they are
    # looking at is now wrong in two places.
    def hand_over
      authorize @membership, :hand_over?

      if @membership.user_id == current_user.id
        render json: { errors: { user_id: [ "already has this trip" ] } }, status: :unprocessable_entity
      else
        ActiveRecord::Base.transaction do
          # Step back before they step up: one owner per trip is a unique index, so
          # there is no instant with two owner rows. Roles are swapped in place, so
          # neither of you looks like you joined just now.
          own_membership.update!(role: "member")
          @membership.update!(role: "owner")
        end
        render json: collaborators_body
      end
    end

    private

    # Two gates in one find: the scope decides whether this trip exists as far as the
    # caller is concerned, so a trip they are not on is a 404 indistinguishable from
    # one that was never there. kind is checked here too -- an idea has no people on
    # it, and answering about one would be answering about a row nobody asked about.
    def set_trip
      @trip = policy_scope(Entry).where(kind: "trip").find(params[:trip_id])
    end

    def set_membership
      @membership = @trip.trip_memberships.find_by!(user_id: params[:user_id])
    end

    def own_membership
      @trip.trip_memberships.find_by!(user_id: current_user.id)
    end

    # Read fresh rather than memoized: hand_over changes it mid-request.
    def my_role
      @trip.role_for(current_user)
    end

    def collaborators_body
      memberships = @trip.trip_memberships.includes(:user).order(:created_at, :id).to_a
      {
        collaborators: CollaboratorSerializer.list(memberships, current_user: current_user, viewer_role: my_role),
        my_role: my_role
      }
    end

    def invitation_errors(email, role)
      errors = {}
      if email.blank?
        errors[:email] = [ "can't be blank" ]
      elsif !email.match?(URI::MailTo::EMAIL_REGEXP)
        errors[:email] = [ "is not an email address" ]
      end

      if role.blank?
        errors[:role] = [ "can't be blank" ]
      elsif GRANTABLE_ROLES.exclude?(role)
        errors[:role] = [ "must be member or viewer" ]
      end

      errors
    end

    def render_refusal(exception)
      render json: { error: refusal_message(exception) }, status: :forbidden
    end

    # Two different rules can refuse the same verb, so the owner row is checked first
    # for the two it governs: taking the owner off, and demoting them. Handing the
    # trip on is refused only for being too junior, never for who the target is.
    def refusal_message(exception)
      record = exception.record
      # to_s because Pundit hands back whatever it was given: a String for the verb
      # inferred from the action, a Symbol for one named outright.
      query = exception.query.to_s
      if [ "update?", "destroy?" ].include?(query) && record.is_a?(TripMembership) && record.role == "owner"
        OWNER_IS_STUCK
      else
        REFUSALS.fetch(query, "You can see this trip, but not do that to it.")
      end
    end
  end
end
