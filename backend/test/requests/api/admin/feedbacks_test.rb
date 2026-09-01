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

    delete "/api/admin/feedbacks/1"
    assert_response :unauthorized

    get "/api/admin/feedbacks/export"
    assert_response :unauthorized

    get "/api/admin/feedbacks/1/screenshots/1"
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

    delete "/api/admin/feedbacks/#{feedback.id}"
    assert_response :forbidden
    assert Feedback.exists?(feedback.id)

    get "/api/admin/feedbacks/export"
    assert_response :forbidden
    assert_equal({ "error" => "Admin access required" }, JSON.parse(response.body))

    get "/api/admin/feedbacks/#{feedback.id}/screenshots/1"
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

  # --- Destroy ----------------------------------------------------------------

  test "destroy removes a dealt-with feedback and its screenshots, bucket included" do
    feedback = Feedback.create!(user: @reporter, message: "Dealt with", status: "done")
    feedback.screenshots.attach(fixture_file_upload("screenshot.png", "image/png"))
    key = feedback.screenshots.sole.blob.key
    sign_in_as(@admin)

    assert_difference [-> { Feedback.count }, -> { ActiveStorage::Attachment.count }, -> { ActiveStorage::Blob.count }], -1 do
      delete "/api/admin/feedbacks/#{feedback.id}"
    end

    assert_response :no_content
    assert_empty response.body
    assert_not ActiveStorage::Blob.service.exist?(key), "the screenshot outlived its feedback"
  end

  test "destroy removes a rejected feedback too" do
    feedback = Feedback.create!(user: @reporter, message: "Read and not acting on it", status: "rejected")
    sign_in_as(@admin)

    delete "/api/admin/feedbacks/#{feedback.id}"
    assert_response :no_content
    assert_not Feedback.exists?(feedback.id)
  end

  # Deletion is for the endings only -- a note still in triage carries a decision
  # nobody has made yet, and the endpoint refuses to make it by accident.
  test "destroy refuses feedback that is still in triage" do
    fresh = Feedback.create!(user: @reporter, message: "Still new")
    picked_up = Feedback.create!(user: @other, message: "Being worked on", status: "in_progress")
    sign_in_as(@admin)

    [fresh, picked_up].each do |feedback|
      delete "/api/admin/feedbacks/#{feedback.id}"
      assert_response :unprocessable_entity
      assert_equal({ "error" => "Only done or rejected feedback can be deleted" }, JSON.parse(response.body))
      assert Feedback.exists?(feedback.id), "#{feedback.status} feedback was deleted"
    end
  end

  test "destroy answers 404 for an id that does not exist" do
    sign_in_as(@admin)

    delete "/api/admin/feedbacks/999999"
    assert_response :not_found
    assert_equal({ "error" => "Not found" }, JSON.parse(response.body))
  end

  # The 403 comes from the door, not from deletability: even a feedback that an
  # admin could delete stays put when a non-admin asks.
  test "destroy turns a non-admin away even for dealt-with feedback" do
    feedback = Feedback.create!(user: @reporter, message: "Dealt with", status: "done")
    sign_in_as(@reporter)

    delete "/api/admin/feedbacks/#{feedback.id}"
    assert_response :forbidden
    assert Feedback.exists?(feedback.id)
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
    assert_equal %w[id created_at user_name user_email status message url element_selector element_classes user_agent screenshots],
                 rows.first
    assert_equal [feedback.id.to_s, feedback.created_at.iso8601, "Reporter", "reporter@example.com",
                  "new", "A message, with a comma", "http://localhost:5173/trips/1/schedule", nil, nil, "WendTest/1.0", nil],
                 rows.second
  end

  # The file is opened days after it was made, so its links are this app's own
  # screenshot route rather than the fifteen-minute bucket URLs the JSON
  # carries -- one link per picture, space separated in a single cell, absolute
  # on the host the export was fetched from.
  test "export links every screenshot through the admin screenshot route" do
    with_pictures = Feedback.create!(user: @reporter, message: "Two pictures")
    with_pictures.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "before.png")
    with_pictures.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "after.png")
    without = Feedback.create!(user: @other, message: "No pictures")
    sign_in_as(@admin)

    get "/api/admin/feedbacks/export"
    assert_response :success

    cells = CSV.parse(response.body, headers: true).to_h { |row| [row["id"].to_i, row["screenshots"]] }
    assert_nil cells[without.id]

    expected = with_pictures.screenshots.map do |shot|
      "http://www.example.com/api/admin/feedbacks/#{with_pictures.id}/screenshots/#{shot.id}"
    end
    assert_equal 2, expected.length
    assert_equal expected.join(" "), cells[with_pictures.id]
  end

  # --- Screenshots ------------------------------------------------------------

  # The link in the CSV, followed: the route checks the caller and only then
  # mints a fresh signed URL and sends them on to it. With the test's Disk
  # service that URL is a route on this host, so the redirect can be followed
  # all the way to the bytes.
  test "a screenshot link redirects an admin to the picture itself" do
    feedback = Feedback.create!(user: @reporter, message: "With a picture")
    feedback.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "broken-chip.png")
    shot = feedback.screenshots.sole
    sign_in_as(@admin)

    get "/api/admin/feedbacks/#{feedback.id}/screenshots/#{shot.id}"
    assert_response :redirect
    # The Disk service's signed route, on the host the caller came in on -- the
    # same address the JSON serializer would have handed the admin screen.
    assert_match %r{\Ahttp://www\.example\.com/rails/active_storage/disk/}, response.location

    follow_redirect!
    assert_response :success
    assert_equal file_fixture("screenshot.png").binread, response.body.b
  end

  # An attachment id paired with a feedback it does not belong to is a 404, not
  # someone else's picture: the lookup is scoped to the addressed feedback's own
  # attachments rather than to the attachments table.
  test "a screenshot link answers 404 for a missing feedback or a picture that is not its own" do
    mine = Feedback.create!(user: @reporter, message: "Mine")
    mine.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "mine.png")
    other = Feedback.create!(user: @other, message: "Someone else's")
    sign_in_as(@admin)

    get "/api/admin/feedbacks/#{other.id}/screenshots/#{mine.screenshots.sole.id}"
    assert_response :not_found

    get "/api/admin/feedbacks/#{mine.id}/screenshots/0"
    assert_response :not_found

    get "/api/admin/feedbacks/0/screenshots/#{mine.screenshots.sole.id}"
    assert_response :not_found
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

  # The admin screen filters in the browser and sends no param, so it keeps
  # getting the whole pile; the param is for callers with no browser to filter
  # in, and narrows the list exactly as it narrows the file.
  test "index narrows to the statuses asked for, and keeps the whole pile without the param" do
    fresh = Feedback.create!(user: @reporter, message: "Still new")
    Feedback.create!(user: @other, message: "Dealt with", status: "done")
    sign_in_as(@admin)

    get "/api/admin/feedbacks", params: { status: %w[new] }
    assert_response :success
    assert_equal [fresh.id], JSON.parse(response.body)["feedbacks"].map { |f| f["id"] }

    get "/api/admin/feedbacks"
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

  # --- Bearer token ------------------------------------------------------------

  test "a valid bearer token reads the list and the export without a session" do
    feedback = Feedback.create!(user: @reporter, message: "Fetched by a script",
                                user_agent: "WendTest/1.0")

    with_admin_api_token("s3cret") do
      get "/api/admin/feedbacks", headers: { "Authorization" => "Bearer s3cret" }
      assert_response :success
      row = JSON.parse(response.body)["feedbacks"].sole
      assert_equal feedback.id, row["id"]
      assert_equal "new", row["status"]
      assert_equal "reporter@example.com", row.dig("user", "email")

      get "/api/admin/feedbacks/export", headers: { "Authorization" => "Bearer s3cret" }
      assert_response :success
      assert_equal "text/csv", response.media_type
      assert_equal [feedback.id.to_s], CSV.parse(response.body).drop(1).map(&:first)
    end
  end

  # The export the token can fetch prints screenshot links; the same token has
  # to be able to follow them, or the file is half an export.
  test "a valid bearer token follows the export's screenshot links without a session" do
    feedback = Feedback.create!(user: @reporter, message: "Fetched by a script, with a picture")
    feedback.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "shot.png")

    with_admin_api_token("s3cret") do
      get "/api/admin/feedbacks/export", headers: { "Authorization" => "Bearer s3cret" }
      assert_response :success
      link = CSV.parse(response.body, headers: true).first["screenshots"]
      assert_equal "http://www.example.com/api/admin/feedbacks/#{feedback.id}/screenshots/#{feedback.screenshots.sole.id}",
                   link

      get link, headers: { "Authorization" => "Bearer s3cret" }
      assert_response :redirect
      follow_redirect!
      assert_response :success

      get link, headers: { "Authorization" => "Bearer wrong" }
      assert_response :unauthorized

      get link
      assert_response :unauthorized
    end
  end

  test "the token narrows the list the same way a signed-in admin can" do
    fresh = Feedback.create!(user: @reporter, message: "Still new")
    Feedback.create!(user: @other, message: "Dealt with", status: "done")

    with_admin_api_token("s3cret") do
      get "/api/admin/feedbacks", params: { status: %w[new] },
                                  headers: { "Authorization" => "Bearer s3cret" }
      assert_response :success
      assert_equal [fresh.id], JSON.parse(response.body)["feedbacks"].map { |f| f["id"] }
    end
  end

  test "a wrong or missing token stops at the first door" do
    with_admin_api_token("s3cret") do
      get "/api/admin/feedbacks", headers: { "Authorization" => "Bearer wrong" }
      assert_response :unauthorized

      get "/api/admin/feedbacks"
      assert_response :unauthorized

      get "/api/admin/feedbacks/export", headers: { "Authorization" => "Bearer wrong" }
      assert_response :unauthorized
    end
  end

  test "the token opens the read actions only, never triage or deletion" do
    feedback = Feedback.create!(user: @reporter, message: "Not writable by script")
    dealt_with = Feedback.create!(user: @other, message: "Not deletable by script", status: "done")

    with_admin_api_token("s3cret") do
      patch "/api/admin/feedbacks/#{feedback.id}",
            params: { feedback: { status: "done" } }, as: :json,
            headers: { "Authorization" => "Bearer s3cret" }
      assert_response :unauthorized
      assert_equal "new", feedback.reload.status

      # Even a feedback an admin could delete: destroy is outside TOKEN_ACTIONS,
      # so the token leaves the request with no identity at all and it stops at
      # the first door.
      delete "/api/admin/feedbacks/#{dealt_with.id}",
             headers: { "Authorization" => "Bearer s3cret" }
      assert_response :unauthorized
      assert Feedback.exists?(dealt_with.id)
    end
  end

  test "with no ADMIN_API_TOKEN configured, bearer auth does not exist" do
    with_admin_api_token(nil) do
      get "/api/admin/feedbacks", headers: { "Authorization" => "Bearer anything" }
      assert_response :unauthorized
    end
  end

  test "a blank secret never matches a blank header" do
    with_admin_api_token("") do
      get "/api/admin/feedbacks", headers: { "Authorization" => "Bearer " }
      assert_response :unauthorized

      get "/api/admin/feedbacks", headers: { "Authorization" => "Bearer" }
      assert_response :unauthorized
    end
  end

  test "the token does not loosen the cookie doors" do
    sign_in_as(@reporter)

    with_admin_api_token("s3cret") do
      get "/api/admin/feedbacks"
      assert_response :forbidden

      # A session, when present, stays the identity: the token never upgrades
      # a signed-in non-admin.
      get "/api/admin/feedbacks", headers: { "Authorization" => "Bearer s3cret" }
      assert_response :forbidden
    end
  end

  private

  # The suite has no ENV stubbing helper, so the variable is set and restored by
  # hand. Parallel workers are processes, not threads, so the mutation is
  # invisible to other workers; the ensure keeps it from leaking into the next
  # test in this one.
  def with_admin_api_token(value)
    original = ENV["ADMIN_API_TOKEN"]
    if value.nil?
      ENV.delete("ADMIN_API_TOKEN")
    else
      ENV["ADMIN_API_TOKEN"] = value
    end
    yield
  ensure
    if original.nil?
      ENV.delete("ADMIN_API_TOKEN")
    else
      ENV["ADMIN_API_TOKEN"] = original
    end
  end
end
