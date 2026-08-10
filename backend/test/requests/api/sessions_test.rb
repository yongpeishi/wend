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
