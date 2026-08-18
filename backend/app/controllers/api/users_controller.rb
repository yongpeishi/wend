module Api
  class UsersController < ApplicationController
    # Signup flooding is per-source, so the default remote_ip key is right here
    # (unlike sessions, where the key must include the email).
    rate_limit to: 10, within: 1.minute, only: :create,
               store: AUTH_RATE_LIMIT_STORE,
               with: -> { render json: { error: "Too many attempts. Try again later." }, status: :too_many_requests }

    # Sign-up must be reachable while signed out; signs the new user in.
    def create
      user = User.new(user_params)
      if user.save
        sign_in(user)
        render json: { user: UserSerializer.one(user) }, status: :created
      else
        render json: { errors: user.errors.to_hash(true) }, status: :unprocessable_entity
      end
    end

    private

    def user_params
      params.permit(:name, :email, :password)
    end
  end
end
