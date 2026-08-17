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

    # The creator the factories below fall back to when a test does not name one.
    # Memoized per test rather than a fresh user per call: creating a trip grants
    # its creator the owner membership, so a fresh user per call would have made
    # every unattributed trip belong to a stranger to everything else in the test.
    # `sign_in_as` points this at the signed-in user, so in a request test
    # `create_trip` with no arguments makes a trip that user owns.
    def default_creator
      @default_creator ||= create_user
    end

    attr_writer :default_creator

    def create_trip(title: "Trip", created_by: nil, **attrs)
      Entry.create!(kind: "trip", title: title, created_by: created_by || default_creator, **attrs)
    end

    def create_idea(title: "Idea", category: "place", created_by: nil, **attrs)
      Entry.create!(kind: "idea", title: title, category: category,
                    created_by: created_by || default_creator, **attrs)
    end

    def create_bundle(title: "Bundle", created_by: nil)
      Entry.create!(kind: "bundle", title: title, created_by: created_by || default_creator)
    end

    def link!(parent:, child:, position: 0)
      EntryLink.create!(parent: parent, child: child, position: position)
    end

    def member!(trip:, user:, role: "member")
      TripMembership.create!(trip: trip, user: user, role: role)
    end

    # Query budget guard for the list paths. Ignores transaction control statements,
    # which say nothing about how the work scales with row count.
    def count_queries(&block)
      count = 0
      counter_fn = ->(*, payload) { count += 1 unless payload[:sql].match?(/\A(BEGIN|COMMIT|SAVEPOINT|RELEASE)/i) }
      ActiveSupport::Notifications.subscribed(counter_fn, "sql.active_record", &block)
      count
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
      # Whoever is signed in is the natural author of anything the test goes on to
      # build, and on a trip that also makes them its owner. Tests that want an
      # entry belonging to someone else still say so with an explicit created_by:.
      self.default_creator = user
    end
  end
end
