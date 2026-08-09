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
end
