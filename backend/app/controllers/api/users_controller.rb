module Api
  class UsersController < ApplicationController
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
