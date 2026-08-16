ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
    def create_user(name: "Test User", email: "user#{SecureRandom.hex(4)}@example.com", password: "password123")
      User.create!(name: name, email: email, password: password)
    end

    def create_trip(title: "Trip", created_by: create_user, **attrs)
      Entry.create!(kind: "trip", title: title, created_by: created_by, **attrs)
    end

    def create_idea(title: "Idea", category: "place", created_by: create_user, **attrs)
      Entry.create!(kind: "idea", title: title, category: category, created_by: created_by, **attrs)
    end

    def create_bundle(title: "Bundle", created_by: create_user)
      Entry.create!(kind: "bundle", title: title, created_by: created_by)
    end

    def link!(parent:, child:, position: 0)
      EntryLink.create!(parent: parent, child: child, position: position)
    end
  end
end

# ActionDispatch::IntegrationTest < ActiveSupport::TestCase, so the factory
# helpers above are already available there. This adds a sign-in helper that
# goes through the real session endpoint rather than poking the cookie jar.
module ActionDispatch
  class IntegrationTest
    DEFAULT_PASSWORD = "password123"

    def sign_in_as(user)
      post "/api/session", params: { email: user.email, password: DEFAULT_PASSWORD }, as: :json
      assert_response :created
    end
  end
end
