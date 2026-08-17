require "test_helper"

class UserTest < ActiveSupport::TestCase
  test "requires name and email" do
    user = User.new(password: "password123")
    assert_not user.valid?
    assert_includes user.errors.attribute_names, :name
    assert_includes user.errors.attribute_names, :email
  end

  test "email must be unique case-insensitively" do
    create_user(email: "dup@example.com")
    dup = User.new(name: "Someone", email: "DUP@example.com", password: "password123")
    assert_not dup.valid?
    assert_includes dup.errors.attribute_names, :email
  end

  test "authenticates with has_secure_password" do
    user = create_user(password: "correcthorse")
    assert user.authenticate("correcthorse")
    assert_not user.authenticate("wrong")
  end

  test "destroying a user who made something is refused, not raised" do
    user = create_user
    create_trip(created_by: user)

    assert_nothing_raised { assert_not user.destroy }
    assert_includes user.errors.attribute_names, :base
    assert User.exists?(user.id)
  end

  test "a user who made nothing can still be destroyed" do
    user = create_user
    trip = create_trip
    member!(trip: trip, user: user, role: "viewer")

    assert user.destroy
    assert_empty TripMembership.where(user_id: user.id)
  end
end
