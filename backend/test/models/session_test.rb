require "test_helper"

class SessionTest < ActiveSupport::TestCase
  test "generates a token on create" do
    session = create_user.sessions.create!
    assert session.token.present?
  end

  test "two sessions never share a token" do
    user = create_user
    a = user.sessions.create!
    b = user.sessions.create!
    assert_not_equal a.token, b.token
  end

  test "expires_at defaults to the session lifetime from now" do
    session = create_user.sessions.create!
    assert_in_delta Session::LIFETIME.from_now, session.expires_at, 5.seconds
  end

  test "an explicit expires_at is kept, not overwritten" do
    explicit = 1.day.from_now
    session = create_user.sessions.create!(expires_at: explicit)
    assert_in_delta explicit, session.expires_at, 1.second
  end

  test "active? follows expires_at" do
    session = create_user.sessions.create!
    assert session.active?

    session.update!(expires_at: 1.minute.ago)
    assert_not session.active?
  end

  test "the active scope excludes expired sessions" do
    user = create_user
    live = user.sessions.create!
    dead = user.sessions.create!(expires_at: 1.minute.ago)

    assert_includes Session.active, live
    assert_not_includes Session.active, dead
  end
end
