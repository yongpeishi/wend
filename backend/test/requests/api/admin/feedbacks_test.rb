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

    patch "/api/admin/feedbacks/1", params: { feedback: { status: "rejected" } }, as: :json
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

    patch "/api/admin/feedbacks/#{feedback.id}", params: { feedback: { status: "rejected" } }, as: :json
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
        "screenshots" => [],
        "created_at" => older.created_at.iso8601,
        "updated_at" => older.updated_at.iso8601,
        "user_agent" => "WendTest/1.0",
        "user" => { "id" => @reporter.id, "name" => "Reporter", "email" => "reporter@example.com" }
      },
      first
    )
  end

  # The budget is a constant, not a small number: whatever it is, adding rows and
  # adding pictures must not move it. Every row here carries a screenshot so the
  # attachment and blob preloads are actually exercised -- without them this is the
  # shape that would cost two more queries per row, on a list with no pagination.
  test "index does not run one query per row, or per picture" do
    5.times do |i|
      feedback = Feedback.create!(user: [@reporter, @other][i % 2], message: "Note #{i}")
      feedback.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "shot-#{i}.png")
    end
    sign_in_as(@admin)

    queries = count_queries { get "/api/admin/feedbacks" }
    assert_response :success
    assert_operator queries, :<=, 6, "index should preload users, attachments and blobs, not fetch them per row"
  end

  # --- Update -----------------------------------------------------------------

  test "update moves a feedback through triage and returns the admin shape" do
    feedback = Feedback.create!(user: @reporter, message: "Please triage me")
    sign_in_as(@admin)

    patch "/api/admin/feedbacks/#{feedback.id}", params: { feedback: { status: "rejected" } }, as: :json
    assert_response :success

    body = JSON.parse(response.body)["feedback"]
    assert_equal "rejected", body["status"]
    assert_equal @reporter.email, body.dig("user", "email")
    assert_equal "rejected", feedback.reload.status
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

  # Triage is mostly looking at the picture, so the admin shape carries the same
  # screenshots the reporter's own view does -- inherited from FeedbackSerializer
  # rather than assembled again here, which is what keeps the two from drifting.
  test "index carries the screenshots on a row that has them" do
    with_picture = Feedback.create!(user: @reporter, message: "Look at this")
    with_picture.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "broken-chip.png")
    without = Feedback.create!(user: @other, message: "Words only")
    sign_in_as(@admin)

    get "/api/admin/feedbacks"
    assert_response :success

    rows = JSON.parse(response.body)["feedbacks"].index_by { |f| f["id"] }
    shot = rows[with_picture.id]["screenshots"].sole
    assert_equal "broken-chip.png", shot["filename"]
    assert_equal "image/png", shot["content_type"]
    assert_operator shot["byte_size"], :>, 0
    assert shot["url"].to_s.start_with?("http"), shot["url"].inspect

    assert_equal [], rows[without.id]["screenshots"]
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

  test "export narrows to the statuses asked for, and to nothing else" do
    fresh = Feedback.create!(user: @reporter, message: "Still new")
    rejected = Feedback.create!(user: @reporter, message: "Read and not acting on it", status: "rejected")
    Feedback.create!(user: @other, message: "Dealt with", status: "done")
    sign_in_as(@admin)

    get "/api/admin/feedbacks/export", params: { status: %w[new rejected] }
    assert_response :success

    ids = CSV.parse(response.body).drop(1).map(&:first)
    assert_equal [rejected.id.to_s, fresh.id.to_s].sort, ids.sort
  end

  test "export takes one status as a bare param too" do
    Feedback.create!(user: @reporter, message: "Still new")
    done = Feedback.create!(user: @other, message: "Dealt with", status: "done")
    sign_in_as(@admin)

    get "/api/admin/feedbacks/export", params: { status: "done" }
    assert_response :success

    rows = CSV.parse(response.body).drop(1)
    assert_equal [done.id.to_s], rows.map(&:first)
  end

  # A download link has no error surface to render a 422 into, so a hand-edited
  # or stale URL widens back to everything rather than failing or exporting an
  # empty file that looks like "there is no feedback".
  test "export ignores an unknown status instead of refusing or emptying the file" do
    2.times { |i| Feedback.create!(user: @reporter, message: "Note #{i}") }
    sign_in_as(@admin)

    get "/api/admin/feedbacks/export", params: { status: %w[triaged] }
    assert_response :success
    assert_equal 2, CSV.parse(response.body).drop(1).length

    get "/api/admin/feedbacks/export", params: { status: [] }
    assert_response :success
    assert_equal 2, CSV.parse(response.body).drop(1).length
  end

  test "export keeps the whole pile when no status is asked for" do
    Feedback.create!(user: @reporter, message: "Still new")
    Feedback.create!(user: @other, message: "Dealt with", status: "done")
    sign_in_as(@admin)

    get "/api/admin/feedbacks/export"
    assert_response :success
    assert_equal 2, CSV.parse(response.body).drop(1).length
  end

  # The filter narrows the file, never the screen's own list: the table filters
  # in the browser and needs the whole pile to say "3 of 4".
  test "index ignores the export's status filter" do
    Feedback.create!(user: @reporter, message: "Still new")
    Feedback.create!(user: @other, message: "Dealt with", status: "done")
    sign_in_as(@admin)

    get "/api/admin/feedbacks", params: { status: %w[new] }
    assert_response :success
    assert_equal 2, JSON.parse(response.body)["feedbacks"].length
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
