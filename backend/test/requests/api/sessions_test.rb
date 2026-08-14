require "test_helper"

class Api::SessionsTest < ActionDispatch::IntegrationTest
  test "GET /api/me is 401 when signed out" do
    get "/api/me"
    assert_response :unauthorized
    assert_equal "application/json; charset=utf-8", response.content_type
  end

  test "POST /api/users creates and signs in a user" do
    post "/api/users", params: { name: "New User", email: "new@example.com", password: "password123" }, as: :json
    assert_response :created
    body = JSON.parse(response.body)
    assert_equal "new@example.com", body.dig("user", "email")

    get "/api/me"
    assert_response :success
  end

  # A session says who you are, not what you may reach: signing in is the start of
  # the question, never the answer to it.
  test "a session reaches only its own user's world" do
    owner = create_user(email: "owner-sess@example.com")
    theirs = create_trip(title: "Theirs", created_by: owner)
    stranger = create_user(email: "stranger-sess@example.com")
    sign_in_as(stranger)

    get "/api/me"
    assert_response :success
    assert_equal stranger.id, JSON.parse(response.body).dig("user", "id")

    get "/api/entries/#{theirs.id}"
    assert_response :not_found
  end

  test "POST /api/session signs in with correct credentials" do
    user = create_user(email: "sess@example.com")
    post "/api/session", params: { email: "sess@example.com", password: "password123" }, as: :json
    assert_response :created

    get "/api/me"
    assert_response :success
    assert_equal user.id, JSON.parse(response.body).dig("user", "id")
  end

  test "POST /api/session rejects wrong password" do
    create_user(email: "sess2@example.com")
    post "/api/session", params: { email: "sess2@example.com", password: "wrong" }, as: :json
    assert_response :unauthorized
  end

  test "DELETE /api/session signs out" do
    user = create_user
    sign_in_as(user)
    delete "/api/session"
    assert_response :no_content

    get "/api/me"
    assert_response :unauthorized
  end
end
