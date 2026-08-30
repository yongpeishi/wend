require_relative "boot"

require "rails"
# Pick the frameworks you want:
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
require "active_storage/engine"
require "action_controller/railtie"
require "action_mailer/railtie"
# require "action_mailbox/engine"
# require "action_text/engine"
require "action_view/railtie"
require "action_cable/engine"
require "rails/test_unit/railtie"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

# Environment files live under backend/env/, one per Rails environment, rather
# than as a dotfile at the backend root: development.env for local work, and
# staging.env for the Pi, which only ever leaves this machine through
# scripts/staging/upload-env-var. dotenv-rails reads env/<RAILS_ENV>.env and
# nothing else, so the test suite never sees a developer's real credentials.
# It must be set here, before the Application class below is defined -- that
# is when dotenv loads its files. dotenv-rails is development-and-test only,
# hence the guard.
Dotenv::Rails.files = ["env/#{Dotenv::Rails.env}.env"] if defined?(Dotenv::Rails)

module Backend
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks])

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Only loads a smaller set of middleware suitable for API only apps.
    # Middleware like session, flash, cookies can be added back manually.
    # Skip views, helpers and assets when generating a new resource.
    config.api_only = true

    # We authenticate via a signed cookie (cookies.signed[:user_id]), so we need
    # the cookie middleware even though this is an API-only app.
    config.middleware.use ActionDispatch::Cookies

    # Active Storage is here for feedback screenshots, which are stored and served
    # exactly as uploaded -- nothing asks for a thumbnail or a resize. Saying so
    # out loud is the difference between an honest "we don't do variants" and the
    # warning Rails otherwise prints on every eager-loading boot telling us to add
    # image_processing (and, behind it, libvips) for a feature we never call.
    config.active_storage.variant_processor = :disabled
  end
end
