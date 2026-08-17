require "test_helper"

class TripMembershipTest < ActiveSupport::TestCase
  setup do
    @owner = create_user
    @trip = create_trip(created_by: @owner)
    @other = create_user
  end

  test "creating a trip grants its creator the owner membership" do
    membership = TripMembership.find_by(trip: @trip, user: @owner)
    assert_equal "owner", membership.role
  end

  test "role must be one of owner, member, viewer" do
    membership = TripMembership.new(trip: @trip, user: @other, role: "editor")
    assert_not membership.valid?
    assert_includes membership.errors.attribute_names, :role

    TripMembership::ROLES.each do |role|
      assert TripMembership.new(trip: create_trip(created_by: @owner), user: @other, role: role).valid?, role
    end
  end

  test "one role per person per trip" do
    dup = TripMembership.new(trip: @trip, user: @owner, role: "viewer")
    assert_not dup.valid?
    assert_includes dup.errors.attribute_names, :user_id
  end

  test "the trip must actually be a trip" do
    idea = create_idea(created_by: @owner)
    membership = TripMembership.new(trip: idea, user: @other, role: "member")
    assert_not membership.valid?
    assert_includes membership.errors.attribute_names, :trip
  end

  test "the last owner cannot be removed" do
    membership = TripMembership.find_by!(trip: @trip, user: @owner)
    assert_not membership.destroy
    assert TripMembership.exists?(membership.id)
  end

  test "a former owner can be removed once the trip has been handed on" do
    first = TripMembership.find_by!(trip: @trip, user: @owner)
    first.update!(role: "member")
    TripMembership.create!(trip: @trip, user: @other, role: "owner")

    assert first.destroy
  end

  test "non-owner memberships can always be removed" do
    membership = TripMembership.create!(trip: @trip, user: @other, role: "viewer")
    assert membership.destroy
  end

  test "the database refuses a second owner on the same trip" do
    assert_raises ActiveRecord::RecordNotUnique do
      TripMembership.new(trip: @trip, user: @other, role: "owner").save!(validate: false)
    end
  end

  test "changing kind away from trip clears its memberships" do
    TripMembership.create!(trip: @trip, user: @other, role: "member")
    @trip.update!(kind: "idea")
    assert_empty TripMembership.where(trip_id: @trip.id)
  end

  test "lifting an idea into a trip grants its creator the owner membership" do
    idea = create_idea(created_by: @owner)
    idea.update!(kind: "trip")
    assert_equal "owner", TripMembership.find_by(trip_id: idea.id, user: @owner)&.role
  end

  test "RANK orders the roles" do
    assert_equal %w[viewer member owner], TripMembership::RANK.sort_by { |_, rank| rank }.map(&:first)
  end
end
