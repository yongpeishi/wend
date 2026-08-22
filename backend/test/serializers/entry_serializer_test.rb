require "test_helper"

# The list shape is asserted end-to-end in test/requests/api/entries_test.rb.
# This file exists for the one thing a request test cannot pin down cleanly: that
# `.list` stays a fixed number of bulk queries as the page grows.
class EntrySerializerTest < ActiveSupport::TestCase
  setup do
    @user = create_user(name: "Sarah")
  end

  test "voters names every vote, in user_id order" do
    peter = create_user(name: "Peter")
    anna = create_user(name: "Anna")
    idea = create_idea(created_by: @user)
    # Created out of order on purpose: the ordering is by user_id, not by when
    # the vote was cast.
    Vote.create!(entry: idea, user: anna, score: -1)
    Vote.create!(entry: idea, user: @user, score: 2)
    Vote.create!(entry: idea, user: peter, score: 1)

    tally = EntrySerializer.one(idea, current_user: @user)["vote_tally"]

    assert_equal 2, tally["total"]
    assert_equal 3, tally["count"]
    assert_equal [
      { "user_id" => @user.id, "user_name" => "Sarah", "score" => 2 },
      { "user_id" => peter.id, "user_name" => "Peter", "score" => 1 },
      { "user_id" => anna.id, "user_name" => "Anna", "score" => -1 }
    ], tally["voters"]
  end

  # The key is always there, so the client never has to guard on its absence.
  test "an entry with no votes still carries an empty voters array" do
    idea = create_idea(created_by: @user)

    tally = EntrySerializer.one(idea, current_user: @user)["vote_tally"]

    assert_equal({ "total" => 0, "count" => 0, "average" => 0.0, "voters" => [] }, tally)
  end

  test "voters are grouped per entry, not shared across the page" do
    peter = create_user(name: "Peter")
    a = create_idea(title: "A", created_by: @user)
    b = create_idea(title: "B", created_by: @user)
    Vote.create!(entry: a, user: @user, score: 2)
    Vote.create!(entry: b, user: peter, score: -2)

    rows = EntrySerializer.list([ a, b ], current_user: @user).index_by { |r| r["id"] }

    assert_equal [ { "user_id" => @user.id, "user_name" => "Sarah", "score" => 2 } ],
                 rows[a.id].dig("vote_tally", "voters")
    assert_equal [ { "user_id" => peter.id, "user_name" => "Peter", "score" => -2 } ],
                 rows[b.id].dig("vote_tally", "voters")
  end

  test "parent_ids lists every parent link ascending, and [] with none" do
    trip = create_trip(created_by: @user)
    bundle = create_bundle(created_by: @user)
    idea = create_idea(created_by: @user)
    # Linked highest-id parent first on purpose: the ordering is by id, not by
    # when the link was made.
    link!(parent: bundle, child: idea)
    link!(parent: trip, child: idea, position: 1)

    rows = EntrySerializer.list([idea, bundle], current_user: @user).index_by { |r| r["id"] }

    assert_equal [trip.id, bundle.id].sort, rows[idea.id]["parent_ids"]
    assert_equal [], rows[bundle.id]["parent_ids"]
  end

  # An id the viewer cannot resolve is deliberately left in: bare integers
  # reveal nothing usable, and the client intersects them with the entries it
  # already fetched. Pins the "unfiltered by visibility" half of the contract.
  test "parent_ids is not filtered by what the current user can see" do
    stranger = create_user(name: "Stranger")
    their_trip = create_trip(title: "Not yours", created_by: stranger)
    idea = create_idea(created_by: @user)
    link!(parent: their_trip, child: idea)

    row = EntrySerializer.one(idea, current_user: @user)

    assert_equal [their_trip.id], row["parent_ids"]
  end

  # `summary` is the one EntrySummary shape in the API: entry `parents`,
  # `Todo#entry` and the itinerary's `entry`/`members` all send exactly this.
  # Asserted as a whole hash, not key by key, because the value of a shared shape
  # is that it stays shared -- a field added here for one caller quietly widens
  # the payload of the other three, and this is where that shows up.
  test "summary sends exactly the EntrySummary keys and nothing else" do
    idea = create_idea(title: "Nanzen-ji", created_by: @user, duration_minutes: 40)

    assert_equal(
      { "id" => idea.id, "kind" => "idea", "title" => "Nanzen-ji", "category" => "place",
        "duration_minutes" => 40 },
      EntrySerializer.summary(idea)
    )
  end

  # `Todo#entry` and a schedule_item's `entry` are both optional, so the nil is
  # handled once here rather than guarded at every call site.
  test "summary of no entry is nil, not an empty hash" do
    assert_nil EntrySerializer.summary(nil)
  end

  # The constraint in this serializer's header comment: fixed, small query count
  # regardless of how many entries are passed. `voters` and `parent_ids` must
  # each be one more bulk query, never one per entry.
  test "list issues the same number of queries for three voted entries as for one" do
    voters = 3.times.map { |i| create_user(name: "Voter #{i}") }
    trip = create_trip(created_by: @user)
    entries = 3.times.map do |i|
      idea = create_idea(title: "Idea #{i}", created_by: @user)
      link!(parent: trip, child: idea, position: i)
      voters.each { |v| Vote.create!(entry: idea, user: v, score: 1) }
      idea
    end

    # Warm anything lazily loaded (schema reflection, the current_user row) so
    # the two measurements below compare like with like.
    EntrySerializer.list(entries, current_user: @user)

    one = count_queries { EntrySerializer.list([ entries.first ], current_user: @user) }
    three = count_queries { EntrySerializer.list(entries, current_user: @user) }

    assert_equal one, three, "expected a fixed query count, got #{one} for 1 entry and #{three} for 3"
  end
end
