require "test_helper"

class Api::FeedbacksTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
  end

  test "POST creates feedback attributed to the signed-in user" do
    assert_difference -> { Feedback.count }, 1 do
      post "/api/feedbacks", params: { feedback: { message: "The schedule scrolls oddly", url: "http://localhost:5173/trips/1/schedule" } }, as: :json
    end
    assert_response :created

    body = JSON.parse(response.body)["feedback"]
    assert_equal "The schedule scrolls oddly", body["message"]
    assert_equal "http://localhost:5173/trips/1/schedule", body["url"]
    assert_equal @user.id, body["user_id"]
    assert_equal "new", body["status"]
  end

  test "POST stores an element capture" do
    post "/api/feedbacks",
         params: { feedback: {
           message: "This chip is unreadable",
           url: "http://localhost:5173/trips/3/board",
           element_selector: "#board > div:nth-child(2)",
           element_classes: "_chip_7ilc4_44"
         } },
         as: :json
    assert_response :created

    feedback = Feedback.last
    assert_equal "http://localhost:5173/trips/3/board", feedback.url
    assert_equal "#board > div:nth-child(2)", feedback.element_selector
    assert_equal "_chip_7ilc4_44", feedback.element_classes
  end

  test "POST records the user agent from the request, not the body" do
    post "/api/feedbacks",
         params: { feedback: { message: "Hello" } },
         headers: { "User-Agent" => "WendTest/1.0" },
         as: :json
    assert_response :created
    assert_equal "WendTest/1.0", Feedback.last.user_agent
    assert_not_includes JSON.parse(response.body)["feedback"].keys, "user_agent"
  end

  test "POST ignores a client-supplied user_id and status" do
    other = create_user(email: "other@example.com")
    post "/api/feedbacks",
         params: { feedback: { message: "Sneaky", user_id: other.id, status: "done" } },
         as: :json
    assert_response :created

    feedback = Feedback.last
    assert_equal @user.id, feedback.user_id
    assert_equal "new", feedback.status
  end

  test "POST rejects a blank message" do
    post "/api/feedbacks", params: { feedback: { message: "   " } }, as: :json
    assert_response :unprocessable_entity
    assert JSON.parse(response.body).dig("errors", "message").present?
  end

  test "GET returns only the signed-in user's feedback, newest first" do
    other = create_user(email: "other@example.com")
    Feedback.create!(user: other, message: "Not yours")
    older = Feedback.create!(user: @user, message: "Older", created_at: 2.days.ago)
    newer = Feedback.create!(user: @user, message: "Newer", created_at: 1.minute.ago)

    get "/api/feedbacks"
    assert_response :success

    ids = JSON.parse(response.body)["feedbacks"].map { |f| f["id"] }
    assert_equal [newer.id, older.id], ids
  end

  test "GET caps the limit" do
    3.times { |i| Feedback.create!(user: @user, message: "Note #{i}") }

    get "/api/feedbacks", params: { limit: 2 }
    assert_response :success
    assert_equal 2, JSON.parse(response.body)["feedbacks"].length
  end

  test "feedback endpoints require a signed-in user" do
    delete "/api/session"

    get "/api/feedbacks"
    assert_response :unauthorized

    post "/api/feedbacks", params: { feedback: { message: "Anonymous" } }, as: :json
    assert_response :unauthorized
  end
end
