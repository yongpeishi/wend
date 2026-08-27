require "test_helper"

class Api::Admin::FeedbacksTest < ActionDispatch::IntegrationTest
  setup do
    @admin = create_user(name: "Admin", email: "admin@example.com")
    @admin.update!(admin: true)
    @reporter = create_user(name: "Reporter", email: "reporter@example.com")
    @other = create_user(name: "Other", email: "other-reporter@example.com")
  end

  # --- The two doors ----------------------------------------------------------

  test "admin feedback endpoints require a signed-in user" do
    get "/api/admin/feedbacks"
    assert_response :unauthorized

    patch "/api/admin/feedbacks/1", params: { feedback: { status: "triaged" } }, as: :json
    assert_response :unauthorized

    get "/api/admin/feedbacks/export"
    assert_response :unauthorized
  end

  test "a signed-in non-admin is turned away with a flat 403" do
    feedback = Feedback.create!(user: @reporter, message: "Not for your eyes")
    sign_in_as(@reporter)

    get "/api/admin/feedbacks"
    assert_response :forbidden
    assert_equal({ "error" => "Admin access required" }, JSON.parse(response.body))

    patch "/api/admin/feedbacks/#{feedback.id}", params: { feedback: { status: "triaged" } }, as: :json
    assert_response :forbidden
    assert_equal "new", feedback.reload.status

    get "/api/admin/feedbacks/export"
    assert_response :forbidden
    assert_equal({ "error" => "Admin access required" }, JSON.parse(response.body))
  end

  # --- Index ------------------------------------------------------------------

  test "index returns every user's feedback, newest first, in the admin shape" do
    older = Feedback.create!(user: @reporter, message: "Older, from the reporter",
                             url: "http://localhost:5173/trips/1/board",
                             element_selector: "#board > div:nth-child(2)",
                             element_classes: "_chip_7ilc4_44",
                             user_agent: "WendTest/1.0",
                             created_at: 2.days.ago)
    newer = Feedback.create!(user: @other, message: "Newer, from someone else", created_at: 1.minute.ago)
    sign_in_as(@admin)

    get "/api/admin/feedbacks"
    assert_response :success

    feedbacks = JSON.parse(response.body)["feedbacks"]
    assert_equal [newer.id, older.id], feedbacks.map { |f| f["id"] }

    first = feedbacks.last # the fully-populated row
    assert_equal(
      {
        "id" => older.id,
        "message" => "Older, from the reporter",
        "user_id" => @reporter.id,
        "url" => "http://localhost:5173/trips/1/board",
        "element_selector" => "#board > div:nth-child(2)",
        "element_classes" => "_chip_7ilc4_44",
        "status" => "new",
        "created_at" => older.created_at.iso8601,
        "updated_at" => older.updated_at.iso8601,
        "user_agent" => "WendTest/1.0",
        "user" => { "id" => @reporter.id, "name" => "Reporter", "email" => "reporter@example.com" }
      },
      first
    )
  end

  test "index does not run one user query per row" do
    5.times { |i| Feedback.create!(user: [@reporter, @other][i % 2], message: "Note #{i}") }
    sign_in_as(@admin)

    queries = count_queries { get "/api/admin/feedbacks" }
    assert_response :success
    assert_operator queries, :<=, 4, "index should preload users, not fetch one per feedback"
  end

  # --- Update -----------------------------------------------------------------

  test "update moves a feedback through triage and returns the admin shape" do
    feedback = Feedback.create!(user: @reporter, message: "Please triage me")
    sign_in_as(@admin)

    patch "/api/admin/feedbacks/#{feedback.id}", params: { feedback: { status: "triaged" } }, as: :json
    assert_response :success

    body = JSON.parse(response.body)["feedback"]
    assert_equal "triaged", body["status"]
    assert_equal @reporter.email, body.dig("user", "email")
    assert_equal "triaged", feedback.reload.status
  end

  test "update rejects an invalid status with the shared 422 shape" do
    feedback = Feedback.create!(user: @reporter, message: "Please triage me")
    sign_in_as(@admin)

    patch "/api/admin/feedbacks/#{feedback.id}", params: { feedback: { status: "escalated" } }, as: :json
    assert_response :unprocessable_entity
    assert JSON.parse(response.body).dig("errors", "status").present?
    assert_equal "new", feedback.reload.status
  end

  test "update permits status and nothing else" do
    feedback = Feedback.create!(user: @reporter, message: "Original message")
    sign_in_as(@admin)

    patch "/api/admin/feedbacks/#{feedback.id}",
          params: { feedback: { status: "done", message: "Rewritten", user_id: @admin.id } }, as: :json
    assert_response :success

    feedback.reload
    assert_equal "done", feedback.status
    assert_equal "Original message", feedback.message
    assert_equal @reporter.id, feedback.user_id
  end

  # --- Export -----------------------------------------------------------------

  test "export sends a CSV attachment with the fixed header and one row per feedback" do
    feedback = Feedback.create!(user: @reporter, message: "A message, with a comma",
                                url: "http://localhost:5173/trips/1/schedule",
                                user_agent: "WendTest/1.0")
    sign_in_as(@admin)

    get "/api/admin/feedbacks/export"
    assert_response :success
    assert_equal "text/csv", response.media_type
    assert_equal %(attachment; filename="wend-feedback-#{Date.current.iso8601}.csv"; filename*=UTF-8''wend-feedback-#{Date.current.iso8601}.csv),
                 response.headers["Content-Disposition"]

    rows = CSV.parse(response.body)
    assert_equal %w[id created_at user_name user_email status message url element_selector element_classes user_agent],
                 rows.first
    assert_equal [feedback.id.to_s, feedback.created_at.iso8601, "Reporter", "reporter@example.com",
                  "new", "A message, with a comma", "http://localhost:5173/trips/1/schedule", nil, nil, "WendTest/1.0"],
                 rows.second
  end

  # --- The enduser endpoint is untouched --------------------------------------

  test "the enduser /api/feedbacks stays scoped to the caller, even for an admin" do
    Feedback.create!(user: @reporter, message: "Someone else's note")
    mine = Feedback.create!(user: @admin, message: "The admin's own note")
    sign_in_as(@admin)

    get "/api/feedbacks"
    assert_response :success
    assert_equal [mine.id], JSON.parse(response.body)["feedbacks"].map { |f| f["id"] }
  end
end
