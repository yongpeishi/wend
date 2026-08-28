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

  test "triage runs new / rejected / done, and nothing else" do
    assert_equal %w[new rejected done], Feedback::STATUSES
    assert_equal "new", Feedback.create!(user: @user, message: "Fresh").status

    %w[new rejected done].each do |status|
      assert Feedback.new(user: @user, message: "Fine", status: status).valid?, "#{status} should be a status"
    end

    # The name `rejected` replaced -- migration 20260828120000.
    assert_not Feedback.new(user: @user, message: "Nope", status: "triaged").valid?
  end

  test "with_statuses keeps only the statuses asked for" do
    fresh = Feedback.create!(user: @user, message: "Fresh")
    rejected = Feedback.create!(user: @user, message: "Not acting on it", status: "rejected")
    Feedback.create!(user: @user, message: "Dealt with", status: "done")

    assert_equal [fresh.id, rejected.id].sort, Feedback.with_statuses(%w[new rejected]).pluck(:id).sort
    assert_equal [rejected.id], Feedback.with_statuses("rejected").pluck(:id)
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

  test "feedback goes with the user" do
    Feedback.create!(user: @user, message: "Bye")
    assert_difference -> { Feedback.count }, -1 do
      @user.destroy
    end
  end
end
