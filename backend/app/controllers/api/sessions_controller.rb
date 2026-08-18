module Api
  class SessionsController < ApplicationController
    # Keyed per IP *and* per email, not per IP alone: the test suite's
    # sign_in_as helper posts here constantly with unique random emails from
    # one IP, so an IP-only key would 429 the whole suite -- and in production
    # it would let one noisy client lock out everyone behind a shared NAT.
    rate_limit to: 10, within: 1.minute, only: :create,
               by: -> { [ request.remote_ip, params[:email].to_s.downcase.strip ] },
               store: AUTH_RATE_LIMIT_STORE,
               with: -> { render json: { error: "Too many attempts. Try again later." }, status: :too_many_requests }

    # Reachable while signed out: signing in/out and checking session state.
    def create
      user = User.find_by(email: params[:email].to_s.downcase.strip)
      if user&.authenticate(params[:password].to_s)
        sign_in(user)
        render json: { user: UserSerializer.one(user) }, status: :created
      else
        render json: { error: "Invalid email or password" }, status: :unauthorized
      end
    end

    def destroy
      sign_out
      head :no_content
    end

    def me
      if current_user
        render json: { user: UserSerializer.one(current_user) }
      else
        render json: { error: "Not authenticated" }, status: :unauthorized
      end
    end
  end
end
