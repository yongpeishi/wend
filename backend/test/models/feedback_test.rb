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
      user: @user, message: "This button lies", element_selector: "main > button:nth-child(2)", element_label: "Set aside"
    )
    assert feedback.element?
    assert_equal "Set aside", feedback.element_label
  end

  test "drops an element label with no selector to keep the capture coherent" do
    feedback = Feedback.create!(user: @user, message: "General thought", element_label: "Orphan")
    assert_not feedback.element?
    assert_nil feedback.element_label
  end

  test "newest_first returns the most recent submission first" do
    older = Feedback.create!(user: @user, message: "First", created_at: 2.days.ago)
    newer = Feedback.create!(user: @user, message: "Second", created_at: 1.hour.ago)
    assert_equal [newer.id, older.id], Feedback.newest_first.pluck(:id)
  end

  test "feedback goes with the user" do
    Feedback.create!(user: @user, message: "Bye")
    assert_difference -> { Feedback.count }, -1 do
      @user.destroy
    end
  end
end
