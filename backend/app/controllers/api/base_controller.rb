module Api
  # All authenticated API endpoints inherit from here. Session/user creation
  # controllers inherit from ApplicationController directly since they must be
  # reachable while signed out.
  class BaseController < ApplicationController
    before_action :require_login!
  end
end
