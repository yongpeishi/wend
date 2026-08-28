require "test_helper"

class Api::FeedbacksTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
  end

  # Feedback is not trip-scoped: it belongs to a user directly, and a session gives
  # access to your own and nothing else.
  test "requires access -- another user's feedback is never reachable" do
    other = create_user(email: "someone-else@example.com")
    Feedback.create!(user: other, message: "Theirs alone")

    get "/api/feedbacks"
    assert_response :success
    assert_not_includes response.body, "Theirs alone"
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

  # --- Screenshots ------------------------------------------------------------

  test "POST accepts screenshots and serializes them back with usable URLs" do
    post "/api/feedbacks", params: { feedback: {
      message: "Two angles on the same broken chip",
      screenshots: [fixture_file_upload("screenshot.png", "image/png"),
                    fixture_file_upload("screenshot-two.png", "image/png")]
    } }
    assert_response :created

    screenshots = JSON.parse(response.body)["feedback"]["screenshots"]
    assert_equal 2, screenshots.length
    assert_equal %w[screenshot-two.png screenshot.png], screenshots.map { |s| s["filename"] }.sort
    assert_equal ["image/png"], screenshots.map { |s| s["content_type"] }.uniq
    assert screenshots.all? { |s| s["byte_size"].positive? }
    assert screenshots.all? { |s| s["id"].present? }

    # The signed URL is the whole point of the key and the reason Api::BaseController
    # sets ActiveStorage::Current.url_options: without a host the Disk service raises
    # rather than returning a link, so asserting the string is what notices.
    assert screenshots.all? { |s| s["url"].to_s.start_with?("http") }, screenshots.map { |s| s["url"] }.inspect

    assert_equal 2, Feedback.last.screenshots.count
  end

  # A report with no pictures still answers with the key, so the client renders a
  # gallery the same way every time instead of branching on its absence.
  test "POST without screenshots still returns an empty screenshots array" do
    post "/api/feedbacks", params: { feedback: { message: "Words only" } }, as: :json
    assert_response :created
    assert_equal [], JSON.parse(response.body)["feedback"]["screenshots"]
  end

  test "GET lists the screenshots on your own feedback" do
    feedback = Feedback.create!(user: @user, message: "With a picture")
    feedback.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "screenshot.png")

    get "/api/feedbacks"
    assert_response :success

    row = JSON.parse(response.body)["feedbacks"].find { |f| f["id"] == feedback.id }
    assert_equal ["screenshot.png"], row["screenshots"].map { |s| s["filename"] }
    assert row["screenshots"].first["url"].to_s.start_with?("http")
  end

  # The three attachment rules, each through the real endpoint, because their whole
  # job is to answer the reporter -- they reach the client through the shared
  # RecordInvalid -> 422 rendering with no hand-written branch in the controller.

  test "POST rejects more screenshots than a report is allowed" do
    assert_no_difference -> { Feedback.count } do
      post "/api/feedbacks", params: { feedback: {
        message: "Every screen in the app",
        screenshots: Array.new(Feedback::MAX_SCREENSHOTS + 1) { fixture_file_upload("screenshot.png", "image/png") }
      } }
    end
    assert_response :unprocessable_entity
    assert_includes JSON.parse(response.body).dig("errors", "screenshots"),
                    "Screenshots are limited to #{Feedback::MAX_SCREENSHOTS} per report"
  end

  test "POST rejects an oversized screenshot" do
    huge = Tempfile.new(["huge", ".png"], binmode: true)
    huge.write(oversized_png)
    huge.rewind

    assert_no_difference -> { Feedback.count } do
      post "/api/feedbacks", params: { feedback: {
        message: "The whole page at once",
        screenshots: [Rack::Test::UploadedFile.new(huge.path, "image/png")]
      } }
    end
    assert_response :unprocessable_entity
    assert_includes JSON.parse(response.body).dig("errors", "screenshots"), "Screenshots must be 5 MB or smaller"
  ensure
    huge&.close!
  end

  test "POST rejects an attachment that is not an image" do
    assert_no_difference -> { Feedback.count } do
      post "/api/feedbacks", params: { feedback: {
        message: "Attaching my notes instead",
        screenshots: [fixture_file_upload("not-an-image.txt", "text/plain")]
      } }
    end
    assert_response :unprocessable_entity
    assert_includes JSON.parse(response.body).dig("errors", "screenshots"),
                    "Screenshots must be a PNG, JPEG, WebP or GIF image"
  end

  test "feedback endpoints require a signed-in user" do
    delete "/api/session"

    get "/api/feedbacks"
    assert_response :unauthorized

    post "/api/feedbacks", params: { feedback: { message: "Anonymous" } }, as: :json
    assert_response :unauthorized
  end
end
