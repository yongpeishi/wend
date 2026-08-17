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

  # The tests above share their cookie jar with the server, so they would still
  # pass if the browser were never told to drop the cookie. These assert on the
  # wire instead: the Set-Cookie header the browser actually receives.
  test "DELETE /api/session tells the browser to expire the user_id cookie" do
    user = create_user
    sign_in_as(user)
    delete "/api/session"
    assert_response :no_content

    directives = user_id_set_cookie
    assert directives, "expected a Set-Cookie for user_id on sign out"
    assert_equal "", directives.first.split("=", 2).last, "expected the cookie value to be emptied"
    assert_includes directives, "expires=thu, 01 jan 1970 00:00:00 gmt"
  end

  test "DELETE /api/session clears the cookie on the same path sign in set it on" do
    user = create_user
    sign_in_as(user)
    assert_includes user_id_set_cookie, "path=/", "sign in should scope the cookie to the whole site"

    delete "/api/session"
    assert_includes user_id_set_cookie, "path=/", "a delete on a narrower path would not match the cookie"
  end

  test "DELETE /api/session is 204 when already signed out" do
    delete "/api/session"
    assert_response :no_content
  end

  test "signing out ends access to protected endpoints, not just /api/me" do
    user = create_user
    sign_in_as(user)
    get "/api/entries"
    assert_response :success

    delete "/api/session"

    get "/api/entries"
    assert_response :unauthorized
  end

  private

  # The `user_id=...` cookie from the last response, split into its lowercased
  # directives (`["user_id=", "path=/", ...]`), or nil if the response set none.
  def user_id_set_cookie
    header = response.headers["Set-Cookie"]
    return nil if header.blank?

    cookie = Array(header).flat_map { |value| value.split("\n") }.find { |value| value.start_with?("user_id=") }
    cookie&.split(";")&.map { |directive| directive.strip.downcase }
  end
end
