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

  # The constraint in this serializer's header comment: fixed, small query count
  # regardless of how many entries are passed. `voters` must be one more bulk
  # query, never one per entry.
  test "list issues the same number of queries for three voted entries as for one" do
    voters = 3.times.map { |i| create_user(name: "Voter #{i}") }
    entries = 3.times.map do |i|
      idea = create_idea(title: "Idea #{i}", created_by: @user)
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
