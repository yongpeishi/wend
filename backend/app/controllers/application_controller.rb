class ApplicationController < ActionController::API
  include ActionController::Cookies
  include Pundit::Authorization

  # Backing store for the auth rate limits. Rails.cache is :null_store in test,
  # which would make the limit silently untestable; a per-process memory store
  # is the right size for this app.
  AUTH_RATE_LIMIT_STORE = ActiveSupport::Cache::MemoryStore.new

  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_unprocessable

  # Anything outside the user's world is a 404, never a 403: a 403 confirms the trip
  # exists and makes trip ids enumerable, which undoes the feature. RecordNotFound is
  # already rescued to 404 above, so scoped finds need no extra handling.
  rescue_from Pundit::NotAuthorizedError, with: :render_not_found

  private

  # The signed cookie carries only a session token; the Session row is the
  # authority. Expired or destroyed rows behave exactly like signed out, which
  # is what makes server-side revocation real.
  def current_user
    return @current_user if defined?(@current_user)

    session = Session.active.find_by(token: cookies.signed[:session_token])
    @current_user = session&.user
  end

  def sign_in(user)
    # A fresh row per sign-in means a fresh token: rotation, and each browser
    # revocable on its own. secure: true comes from config.force_ssl in
    # production.rb, so it is not repeated here.
    session = user.sessions.create!
    cookies.signed[:session_token] = {
      value: session.token, httponly: true, same_site: :lax, expires: Session::LIFETIME.from_now
    }
    @current_user = user
  end

  def sign_out
    # Destroying the row is the revocation; deleting the cookie is courtesy to
    # the browser -- the token would be dead either way.
    Session.find_by(token: cookies.signed[:session_token])&.destroy
    cookies.delete(:session_token)
    @current_user = nil
  end

  def require_login!
    render json: { error: "Not authenticated" }, status: :unauthorized unless current_user
  end

  def render_not_found
    render json: { error: "Not found" }, status: :not_found
  end

  def render_unprocessable(exception)
    render json: { errors: exception.record.errors.to_hash(true) }, status: :unprocessable_entity
  end
end
