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

    # Attachment URLs are built by the storage service, and the Disk service
    # builds a *route*, not a bucket address -- so it needs a host to put in
    # front of it and raises without one. An API-only app has no default_url_options
    # anywhere to fall back on, and hardcoding a host would be wrong in at least
    # one of laptop / Pi / production, so the answer is the host the caller
    # already reached us on. R2 ignores this entirely (an S3 URL is absolute),
    # which is why it is set unconditionally rather than per-service: the
    # serializer should not have to know which bucket it is signing against.
    before_action :set_active_storage_url_options

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

    def set_active_storage_url_options
      ActiveStorage::Current.url_options = { host: request.base_url }
    end

    def action_key = "#{self.class.name}##{action_name}"

    def listing? = action_name == "index"

    # Query-string flags arrive as strings ("true", "1", "false"...), so a bare
    # present? check would read ?flag=false as on. One shared cast keeps every
    # controller's idea of "the flag is set" identical.
    def truthy?(value) = ActiveModel::Type::Boolean.new.cast(value)
  end
end
