require "test_helper"

class VoteTest < ActiveSupport::TestCase
  test "score must be within -2..2 inclusive" do
    entry = create_idea
    user = create_user

    [-2, -1, 0, 1, 2].each do |score|
      vote = Vote.new(entry: entry, user: user, score: score)
      assert vote.valid?, "expected score #{score} to be valid"
    end

    [-3, 3].each do |score|
      vote = Vote.new(entry: entry, user: create_user, score: score)
      assert_not vote.valid?, "expected score #{score} to be invalid"
    end
  end

  test "zero is a valid, real vote distinct from no vote" do
    entry = create_idea
    user = create_user
    vote = Vote.create!(entry: entry, user: user, score: 0)
    assert_equal 1, Vote.where(entry: entry).count
    assert_equal 0, vote.score
  end

  test "unique per entry and user" do
    entry = create_idea
    user = create_user
    Vote.create!(entry: entry, user: user, score: 1)
    dup = Vote.new(entry: entry, user: user, score: 2)
    assert_not dup.valid?
  end

  test "the same user can vote on different entries" do
    user = create_user
    a = create_idea(title: "A")
    b = create_idea(title: "B")
    assert Vote.create!(entry: a, user: user, score: 2)
    assert Vote.create!(entry: b, user: user, score: -2)
  end
end
