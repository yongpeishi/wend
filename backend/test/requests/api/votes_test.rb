require "test_helper"

class Api::VotesTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
  end

  test "requires access to the entry" do
    theirs = create_idea(created_by: create_user)

    put "/api/entries/#{theirs.id}/vote", params: { score: 2 }, as: :json
    assert_response :not_found
    assert_not Vote.exists?(entry: theirs, user: @user)
  end

  # Voting is a change to the trip, not a way of reading it.
  test "a viewer may read the trip but not vote on it" do
    owner = create_user
    trip = create_trip(created_by: owner)
    idea = create_idea(created_by: owner)
    link!(parent: trip, child: idea)
    member!(trip: trip, user: @user, role: "viewer")

    get "/api/entries/#{idea.id}"
    assert_response :success

    put "/api/entries/#{idea.id}/vote", params: { score: 2 }, as: :json
    assert_response :not_found
    assert_not Vote.exists?(entry: idea, user: @user)

    delete "/api/entries/#{idea.id}/vote"
    assert_response :not_found
  end

  test "PUT sets a vote and returns tally with by_user breakdown" do
    idea = create_idea(created_by: @user)
    other = create_user
    Vote.create!(entry: idea, user: other, score: -1)

    put "/api/entries/#{idea.id}/vote", params: { score: 2 }, as: :json
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal 2, body.dig("vote", "score")
    tally = body["tally"]
    assert_equal 1, tally["total"] # 2 + -1
    assert_equal 2, tally["count"]
    assert_equal 0.5, tally["average"]
    assert_equal 2, tally.dig("by_user", @user.id.to_s)
    assert_equal(-1, tally.dig("by_user", other.id.to_s))
  end

  test "PUT rejects an out-of-range score" do
    idea = create_idea(created_by: @user)
    put "/api/entries/#{idea.id}/vote", params: { score: 3 }, as: :json
    assert_response :unprocessable_entity
  end

  test "PUT upserts (voting twice updates, does not duplicate)" do
    idea = create_idea(created_by: @user)
    put "/api/entries/#{idea.id}/vote", params: { score: 1 }, as: :json
    put "/api/entries/#{idea.id}/vote", params: { score: -2 }, as: :json
    assert_equal 1, Vote.where(entry: idea, user: @user).count
    assert_equal(-2, Vote.find_by(entry: idea, user: @user).score)
  end

  test "DELETE withdraws a vote" do
    idea = create_idea(created_by: @user)
    Vote.create!(entry: idea, user: @user, score: 2)

    delete "/api/entries/#{idea.id}/vote"
    assert_response :no_content
    assert_not Vote.exists?(entry: idea, user: @user)
  end
end
