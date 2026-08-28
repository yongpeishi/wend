ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # The auth rate-limit store is per-process and every test shares remote_ip
    # 127.0.0.1, so counts would accumulate across unrelated tests in a worker
    # until ordinary signups started 429ing. A clean store per test keeps the
    # limit observable only where a test deliberately exceeds it.
    setup { ApplicationController::AUTH_RATE_LIMIT_STORE.clear }

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

    # An honestly-too-large screenshot, for the size half of Feedback's attachment
    # rules. It has to be a real PNG and not merely a big file: Active Storage
    # identifies content type from the leading bytes, so padding a text file would
    # trip the content-type rule first and the size assertion would prove nothing.
    #
    # Built at run time rather than committed to test/fixtures/files, because a
    # multi-megabyte binary in the repository is a bad trade for one assertion.
    # The padding rides in a tEXt chunk -- an ancillary comment chunk the PNG spec
    # allows anywhere between the header and IEND -- so the result is a picture a
    # decoder would happily open, just an absurd one.
    def oversized_png(at_least: Feedback::MAX_SCREENSHOT_BYTES + 1)
      original = file_fixture("screenshot.png").binread
      head, iend = original[0...-12], original[-12..]

      comment = "Comment\0" + ("wend test padding " * (at_least / 18))
      crc = [Zlib.crc32("tEXt" + comment)].pack("N")
      head + [comment.bytesize].pack("N") + "tEXt" + comment + crc + iend
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
      # Some tests (the authorization route sweep) sign the same email in dozens
      # of times within one test, which would trip the per-email sign-in rate
      # limit. This helper is scaffolding, not the behavior under test, so its
      # sign-ins never count against the limit; tests that probe the limit post
      # to /api/session directly.
      ApplicationController::AUTH_RATE_LIMIT_STORE.clear
      post "/api/session", params: { email: user.email, password: DEFAULT_PASSWORD }, as: :json
      assert_response :created
      # Whoever is signed in is the natural author of anything the test goes on to
      # build, and on a trip that also makes them its owner. Tests that want an
      # entry belonging to someone else still say so with an explicit created_by:.
      self.default_creator = user
    end
  end
end
