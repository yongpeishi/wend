class ApplicationController < ActionController::API
  include ActionController::Cookies
  include Pundit::Authorization

  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_unprocessable

  # Anything outside the user's world is a 404, never a 403: a 403 confirms the trip
  # exists and makes trip ids enumerable, which undoes the feature. RecordNotFound is
  # already rescued to 404 above, so scoped finds need no extra handling.
  rescue_from Pundit::NotAuthorizedError, with: :render_not_found

  private

  def current_user
    return @current_user if defined?(@current_user)

    @current_user = User.find_by(id: cookies.signed[:user_id])
  end

  def sign_in(user)
    cookies.signed[:user_id] = { value: user.id, httponly: true, same_site: :lax }
    @current_user = user
  end

  def sign_out
    cookies.delete(:user_id)
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
