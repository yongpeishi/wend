module Api
  class SessionsController < ApplicationController
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
