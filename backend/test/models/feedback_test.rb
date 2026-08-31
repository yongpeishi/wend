require "test_helper"

class FeedbackTest < ActiveSupport::TestCase
  setup do
    @user = create_user
  end

  test "requires a message" do
    feedback = Feedback.new(user: @user, message: "")
    assert_not feedback.valid?
    assert_includes feedback.errors[:message], "can't be blank"
  end

  test "requires a user" do
    assert_not Feedback.new(message: "Something").valid?
  end

  test "rejects a message longer than the limit" do
    feedback = Feedback.new(user: @user, message: "x" * (Feedback::MESSAGE_LIMIT + 1))
    assert_not feedback.valid?
  end

  test "defaults to the new status" do
    feedback = Feedback.create!(user: @user, message: "The map pins are hard to tap")
    assert_equal "new", feedback.status
  end

  test "rejects an unknown status" do
    feedback = Feedback.new(user: @user, message: "Hi", status: "wontfix")
    assert_not feedback.valid?
  end

  test "keeps an element capture when a selector is present" do
    feedback = Feedback.create!(
      user: @user, message: "This button lies", element_selector: "main > button:nth-child(2)",
      element_classes: "_button_1p9dt_29 _quiet_1p9dt_44"
    )
    assert feedback.element?
    assert_equal "_button_1p9dt_29 _quiet_1p9dt_44", feedback.element_classes
  end

  test "drops element classes with no selector to keep the capture coherent" do
    feedback = Feedback.create!(user: @user, message: "General thought", element_classes: "_orphan_1p9dt_29")
    assert_not feedback.element?
    assert_nil feedback.element_classes
  end

  test "newest_first returns the most recent submission first" do
    older = Feedback.create!(user: @user, message: "First", created_at: 2.days.ago)
    newer = Feedback.create!(user: @user, message: "Second", created_at: 1.hour.ago)
    assert_equal [newer.id, older.id], Feedback.newest_first.pluck(:id)
  end

  test "triage runs new / in_progress / rejected / done, and nothing else" do
    assert_equal %w[new in_progress rejected done], Feedback::STATUSES
    assert_equal "new", Feedback.create!(user: @user, message: "Fresh").status

    %w[new in_progress rejected done].each do |status|
      assert Feedback.new(user: @user, message: "Fine", status: status).valid?, "#{status} should be a status"
    end

    # The name `rejected` replaced -- migration 20260828120000.
    assert_not Feedback.new(user: @user, message: "Nope", status: "triaged").valid?
  end

  test "with_statuses keeps only the statuses asked for" do
    fresh = Feedback.create!(user: @user, message: "Fresh")
    picked_up = Feedback.create!(user: @user, message: "Being worked on", status: "in_progress")
    rejected = Feedback.create!(user: @user, message: "Not acting on it", status: "rejected")
    Feedback.create!(user: @user, message: "Dealt with", status: "done")

    assert_equal [fresh.id, rejected.id].sort, Feedback.with_statuses(%w[new rejected]).pluck(:id).sort
    assert_equal [rejected.id], Feedback.with_statuses("rejected").pluck(:id)
    assert_equal [picked_up.id], Feedback.with_statuses("in_progress").pluck(:id)
  end

  # An untouched filter asks for no statuses, and nobody means "show me none of
  # them" by that -- so an empty or unrecognised list widens instead of emptying.
  test "with_statuses treats nothing recognisable as no narrowing at all" do
    3.times { |i| Feedback.create!(user: @user, message: "Note #{i}") }

    assert_equal 3, Feedback.with_statuses([]).count
    assert_equal 3, Feedback.with_statuses(nil).count
    assert_equal 3, Feedback.with_statuses(%w[triaged nonsense]).count
    # One good value among the noise still narrows by that one.
    assert_equal 3, Feedback.with_statuses(%w[new nonsense]).count
  end

  # --- Screenshots ------------------------------------------------------------
  #
  # Every case here attaches to an *unsaved* record and then asks whether it is
  # valid, which is the situation the rules have to work in: if they only held on
  # a persisted record, the file would already be in the bucket by the time it was
  # judged, and rejecting it would be too late to matter.

  test "accepts a screenshot" do
    feedback = Feedback.new(user: @user, message: "The map pins are hard to tap")
    feedback.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "screenshot.png")

    assert feedback.valid?, feedback.errors.full_messages.to_sentence
    assert feedback.save
    assert_equal 1, feedback.reload.screenshots.count
    assert_equal "image/png", feedback.screenshots.first.content_type
  end

  test "accepts screenshots right up to the per-report limit" do
    feedback = Feedback.new(user: @user, message: "Five angles on one bug")
    Feedback::MAX_SCREENSHOTS.times do |i|
      feedback.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "shot-#{i}.png")
    end

    assert feedback.valid?, feedback.errors.full_messages.to_sentence
  end

  test "rejects more screenshots than a report is allowed" do
    feedback = Feedback.new(user: @user, message: "Every screen in the app")
    (Feedback::MAX_SCREENSHOTS + 1).times do |i|
      feedback.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "shot-#{i}.png")
    end

    assert_not feedback.valid?
    assert_includes feedback.errors[:screenshots], "are limited to #{Feedback::MAX_SCREENSHOTS} per report"
  end

  test "rejects a screenshot over the size limit" do
    feedback = Feedback.new(user: @user, message: "Here is the whole page")
    feedback.screenshots.attach(io: StringIO.new(oversized_png), filename: "huge.png", content_type: "image/png")

    assert_not feedback.valid?
    assert_includes feedback.errors[:screenshots], "must be 5 MB or smaller"
  end

  test "rejects an attachment that is not one of the allowed image types" do
    feedback = Feedback.new(user: @user, message: "Attaching my notes instead")
    feedback.screenshots.attach(io: file_fixture("not-an-image.txt").open, filename: "notes.txt")

    assert_not feedback.valid?
    assert_includes feedback.errors[:screenshots], "must be a PNG, JPEG, WebP or GIF image"
  end

  # Six wrong files are one wrong decision, so they get one sentence. Left as its
  # own test because the obvious implementation -- adding inside the loop -- passes
  # every other test here while returning the same line six times to the reporter.
  test "says what is wrong once, however many files are wrong in that way" do
    feedback = Feedback.new(user: @user, message: "Three copies of the same mistake")
    3.times { |i| feedback.screenshots.attach(io: file_fixture("not-an-image.txt").open, filename: "notes-#{i}.txt") }

    assert_not feedback.valid?
    assert_equal ["must be a PNG, JPEG, WebP or GIF image"], feedback.errors[:screenshots]
  end

  test "a report with no screenshots is untouched by the attachment rules" do
    feedback = Feedback.new(user: @user, message: "Just words")

    assert feedback.valid?
    assert_empty feedback.screenshots
  end

  # The point of validating the pending set: a rejected upload must never reach
  # storage, so nothing may have been written by the time validation fails.
  test "an unacceptable screenshot never reaches storage" do
    feedback = Feedback.new(user: @user, message: "Attaching my notes instead")
    feedback.screenshots.attach(io: file_fixture("not-an-image.txt").open, filename: "notes.txt")

    key = feedback.screenshots.attachments.first.blob.key
    assert_not feedback.save
    assert_not ActiveStorage::Blob.service.exist?(key), "the rejected file was uploaded before it was judged"
  end

  # The other half of the promise: a report and its pictures are kept together
  # or not at all. Active Storage's own sequencing commits the rows first and
  # uploads afterwards, which is exactly the case these guard against.

  test "the screenshot is in storage by the time the report is committed" do
    feedback = Feedback.new(user: @user, message: "The map pins are hard to tap")
    feedback.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "screenshot.png")
    key = feedback.screenshots.attachments.first.blob.key

    assert feedback.save
    assert ActiveStorage::Blob.service.exist?(key), "the report was committed without its picture"
  end

  test "a screenshot the bucket refuses leaves nothing behind -- no report, no rows, no files" do
    feedback = Feedback.new(user: @user, message: "Two angles on one bug")
    feedback.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "one.png")
    feedback.screenshots.attach(io: file_fixture("screenshot-two.png").open, filename: "two.png")
    keys = feedback.screenshots.attachments.map { |attachment| attachment.blob.key }

    # The first upload lands and the second is refused, so the test also proves
    # the one that landed is taken back out.
    with_storage_refusing(keys.last) do
      assert_no_difference [-> { Feedback.count }, -> { ActiveStorage::Blob.count }, -> { ActiveStorage::Attachment.count }] do
        assert_raises(IOError) { feedback.save }
      end
    end

    assert_not feedback.persisted?
    keys.each do |key|
      assert_not ActiveStorage::Blob.service.exist?(key), "#{key} was left in storage after the report was rolled back"
    end
  end

  # The cleanup is scoped to one save. A later save of the same object that
  # rolls back must not reach back and delete the pictures an earlier save kept.
  test "a later rollback does not delete screenshots an earlier save kept" do
    feedback = Feedback.new(user: @user, message: "Kept")
    feedback.screenshots.attach(io: file_fixture("screenshot.png").open, filename: "screenshot.png")
    assert feedback.save
    key = feedback.screenshots.first.blob.key

    feedback.status = "wontfix"
    assert_not feedback.save
    assert ActiveStorage::Blob.service.exist?(key), "a failed update deleted a picture the create had kept"
  end

  test "feedback goes with the user" do
    Feedback.create!(user: @user, message: "Bye")
    assert_difference -> { Feedback.count }, -1 do
      @user.destroy
    end
  end
end
