require "test_helper"

class ScheduleItemMemberTimeTest < ActiveSupport::TestCase
  setup do
    @user = create_user
    @trip = create_trip(created_by: @user)
    @bundle = create_bundle(title: "Higashiyama", created_by: @user)
    link!(parent: @trip, child: @bundle)
    @ramen = create_idea(title: "Ramen", created_by: @user)
    @kaiseki = create_idea(title: "Kaiseki", created_by: @user)
    link!(parent: @bundle, child: @ramen, position: 0)
    link!(parent: @bundle, child: @kaiseki, position: 1)
    @item = ScheduleItem.create!(trip: @trip, entry: @bundle, day: "2026-10-12",
                                 starts_at_minutes: 540, ends_at_minutes: 720)
  end

  test "stores hours for a member of the placed plan" do
    time = @item.member_times.create!(entry: @ramen, starts_at_minutes: 540, ends_at_minutes: 600)

    assert time.persisted?
    assert_equal [time], @item.member_times.reload.to_a
    assert_equal [time], @ramen.schedule_item_member_times.reload.to_a
  end

  test "minutes must be whole numbers within the day" do
    time = @item.member_times.new(entry: @ramen, starts_at_minutes: -1, ends_at_minutes: 1440)

    assert_not time.valid?
    assert_includes time.errors[:starts_at_minutes], "must be greater than or equal to 0"
    assert_includes time.errors[:ends_at_minutes], "must be less than or equal to 1439"
    assert_not @item.member_times.new(entry: @ramen, starts_at_minutes: 540.5).valid?
  end

  test "either minute may be nil on its own" do
    assert @item.member_times.new(entry: @ramen, starts_at_minutes: 540).valid?
    assert @item.member_times.new(entry: @ramen, ends_at_minutes: 600).valid?
  end

  test "ends may not come before starts" do
    time = @item.member_times.new(entry: @ramen, starts_at_minutes: 600, ends_at_minutes: 540)

    assert_not time.valid?
    assert_includes time.errors[:ends_at_minutes], "must be greater than or equal to starts_at_minutes"
    assert @item.member_times.new(entry: @ramen, starts_at_minutes: 600, ends_at_minutes: 600).valid?
  end

  test "the entry must be a member of the placed plan, with one message for every way it is not" do
    stranger_idea = create_idea(title: "Elsewhere", created_by: create_user)
    loose_in_trip = create_idea(title: "Loose", created_by: @user)
    link!(parent: @trip, child: loose_in_trip)
    unlinked = create_idea(title: "Nowhere", created_by: @user)

    [stranger_idea.id, loose_in_trip.id, unlinked.id, @bundle.id, Entry.maximum(:id) + 1000].each do |id|
      time = @item.member_times.new(entry_id: id, starts_at_minutes: 540)

      assert_not time.valid?, "entry #{id} should not be timeable on this plan"
      assert_includes time.errors[:entry_id], "must be a member of this plan"
    end
  end

  test "a plain idea's placement cannot carry member times, even when the idea has children" do
    parent = create_idea(title: "Parent", created_by: @user)
    child = create_idea(title: "Child", created_by: @user)
    link!(parent: @trip, child: parent)
    link!(parent: parent, child: child)
    item = ScheduleItem.create!(trip: @trip, entry: parent, day: "2026-10-12")

    time = item.member_times.new(entry: child, starts_at_minutes: 540)

    assert_not time.valid?
    assert_includes time.errors[:entry_id], "must be a member of this plan"
  end

  test "an empty placement cannot carry member times" do
    item = ScheduleItem.create!(trip: @trip, day: "2026-10-12")

    time = item.member_times.new(entry: @ramen, starts_at_minutes: 540)

    assert_not time.valid?
    assert_includes time.errors[:entry_id], "must be a member of this plan"
  end

  test "one row per member per placement" do
    @item.member_times.create!(entry: @ramen, starts_at_minutes: 540)

    assert_raises(ActiveRecord::RecordNotUnique) do
      @item.member_times.create!(entry: @ramen, starts_at_minutes: 600)
    end
  end

  test "the same member is timed separately on each placement of the plan" do
    other_item = ScheduleItem.create!(trip: @trip, entry: @bundle, day: "2026-10-13")

    @item.member_times.create!(entry: @ramen, starts_at_minutes: 540)
    other_item.member_times.create!(entry: @ramen, starts_at_minutes: 600)

    assert_equal 540, @item.member_times.sole.starts_at_minutes
    assert_equal 600, other_item.member_times.sole.starts_at_minutes
  end

  test "destroying the placement destroys its member times" do
    @item.member_times.create!(entry: @ramen, starts_at_minutes: 540)
    @item.member_times.create!(entry: @kaiseki, starts_at_minutes: 600)

    assert_difference("ScheduleItemMemberTime.count", -2) { @item.destroy! }
  end

  test "unlinking a member from the plan removes its hours on every placement of that plan, and nothing else" do
    other_item = ScheduleItem.create!(trip: @trip, entry: @bundle, day: "2026-10-13")
    other_bundle = create_bundle(title: "Elsewhere", created_by: @user)
    link!(parent: @trip, child: other_bundle)
    link!(parent: other_bundle, child: @ramen)
    other_bundle_item = ScheduleItem.create!(trip: @trip, entry: other_bundle, day: "2026-10-13")

    @item.member_times.create!(entry: @ramen, starts_at_minutes: 540)
    @item.member_times.create!(entry: @kaiseki, starts_at_minutes: 600)
    other_item.member_times.create!(entry: @ramen, starts_at_minutes: 555)
    other_bundle_item.member_times.create!(entry: @ramen, starts_at_minutes: 570)

    assert_difference("ScheduleItemMemberTime.count", -2) do
      EntryLink.find_by!(parent: @bundle, child: @ramen).destroy!
    end
    # Kaiseki is still a member; Ramen is still in the other bundle.
    assert_equal [@kaiseki.id], @item.member_times.reload.map(&:entry_id)
    assert_equal [], other_item.member_times.reload.to_a
    assert_equal [@ramen.id], other_bundle_item.member_times.reload.map(&:entry_id)
  end

  test "lifting a member out into its own trip removes its hours, since it leaves every parent" do
    @item.member_times.create!(entry: @ramen, starts_at_minutes: 540)

    assert_difference("ScheduleItemMemberTime.count", -1) { @ramen.parent_links.destroy_all }
  end

  test "deleting a member for good takes its hours with it and leaves the others alone" do
    @item.member_times.create!(entry: @ramen, starts_at_minutes: 540)
    @item.member_times.create!(entry: @kaiseki, starts_at_minutes: 600)
    @ramen.archive!

    assert_difference("ScheduleItemMemberTime.count", -1) do
      EntryPermanentDeletion.new(@ramen, @user).destroy!
    end
    assert_equal [@kaiseki.id], @item.member_times.reload.map(&:entry_id)
    assert ScheduleItem.exists?(@item.id)
  end
end
