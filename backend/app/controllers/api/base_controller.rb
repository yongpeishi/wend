module Api
  # All authenticated API endpoints inherit from here. Session/user creation
  # controllers inherit from ApplicationController directly since they must be
  # reachable while signed out -- which also means the hooks below never reach them
  # and they need no exemption.
  class BaseController < ApplicationController
    # Deny-by-default. Every action is audited by exactly one of the two hooks
    # below: an index by the scope it resolved, everything else by an authorize
    # call on the record it touched.
    #
    # These two lists were the retrofit's remaining work and are now empty, which is
    # the point of the slice: all 27 actions that inherit this controller are
    # audited. Exemptions live here and only here -- a skip_after_action buried in a
    # controller is a hole nobody reviews -- and nothing new is ever added to them.
    # Entries take the form "Api::EntriesController#index".
    UNAUDITED_AUTHORIZE = [].freeze
    UNAUDITED_SCOPE     = [].freeze

    before_action :require_login!

    # An index has no single record to stand in for the collection, so its
    # authorization *is* the scope -- verify_policy_scoped below is what enforces
    # it, and the sweep in test/requests/api/authorization_test.rb asserts the
    # response rather than trusting either hook.
    #
    # Both hooks select on action_name rather than `only:`/`except:`, because Rails
    # raises on a callback naming an action the controller does not have and most of
    # these controllers have no index.
    after_action :verify_authorized,
                 unless: -> { listing? || UNAUDITED_AUTHORIZE.include?(action_key) }
    after_action :verify_policy_scoped,
                 if: -> { listing? && UNAUDITED_SCOPE.exclude?(action_key) }

    private

    def action_key = "#{self.class.name}##{action_name}"

    def listing? = action_name == "index"
  end
end
