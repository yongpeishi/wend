require "test_helper"

class ScheduleItemUngroupTest < ActiveSupport::TestCase
  setup do
    @user = create_user
    @trip = create_trip(created_by: @user)
    @trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-12")
    @version = @trip_day.first_live_version
    @bundle = create_bundle(created_by: @user)
    link!(parent: @trip, child: @bundle)
  end

  def member!(title:, duration_minutes: nil, position: 0)
    idea = create_idea(title: title, created_by: @user, duration_minutes: duration_minutes)
    link!(parent: @bundle, child: idea, position: position)
    idea
  end

  def place_bundle!(starts: 540, ends: 720, note: nil)
    @version.schedule_items.create!(
      trip: @trip, entry: @bundle, day: @trip_day.day,
      starts_at_minutes: starts, ends_at_minutes: ends, note: note, position: 2
    )
  end

  test "ungroup! splits the span in duration_minutes proportion when every member has one" do
    member!(title: "Short", duration_minutes: 60, position: 0)
    member!(title: "Long", duration_minutes: 120, position: 1)
    item = place_bundle!(starts: 540, ends: 720) # 09:00-12:00, 180 minutes

    created = item.ungroup!

    assert_equal ["Short", "Long"], created.map { |i| i.entry.title }
    assert_equal [[540, 600], [600, 720]], created.map { |i| [i.starts_at_minutes, i.ends_at_minutes] }
    assert_not ScheduleItem.exists?(item.id)
    assert_equal [2, 3], created.map(&:position)
    assert_equal [@version.id, @version.id], created.map(&:day_version_id)
  end

  test "ungroup! splits evenly when any member has no duration estimate" do
    member!(title: "A", duration_minutes: 60, position: 0)
    member!(title: "B", duration_minutes: nil, position: 1)
    member!(title: "C", duration_minutes: 30, position: 2)
    item = place_bundle!(starts: 600, ends: 780) # 10:00-13:00, 180 minutes

    slots = item.ungroup!.map { |i| [i.starts_at_minutes, i.ends_at_minutes] }

    assert_equal [[600, 660], [660, 720], [720, 780]], slots
  end

  test "ungroup! leaves no gap or overlap and lands exactly on the old span" do
    member!(title: "A", duration_minutes: 50, position: 0)
    member!(title: "B", duration_minutes: 50, position: 1)
    member!(title: "C", duration_minutes: 50, position: 2)
    item = place_bundle!(starts: 545, ends: 646) # 101 minutes, does not divide by 3

    slots = item.ungroup!.map { |i| [i.starts_at_minutes, i.ends_at_minutes] }

    assert_equal 545, slots.first.first
    assert_equal 646, slots.last.last
    slots.each_cons(2) { |(_, first_end), (second_start, _)| assert_equal first_end, second_start }
  end

  test "ungroup! carries the bundle note onto the first member and drops nothing else" do
    member!(title: "A", position: 0)
    member!(title: "B", position: 1)
    item = place_bundle!(note: "Kaiseki won the vote.")

    created = item.ungroup!

    assert_equal ["Kaiseki won the vote.", nil], created.map(&:note)
    # The bundle Entry itself is untouched -- only the placement went away.
    assert Entry.exists?(@bundle.id)
  end

  test "ungroup! hands members no times when the bundle had none" do
    member!(title: "A", position: 0)
    member!(title: "B", position: 1)
    item = place_bundle!(starts: nil, ends: nil)

    created = item.ungroup!

    assert_equal [nil, nil], created.map(&:starts_at_minutes)
    assert_equal [nil, nil], created.map(&:ends_at_minutes)
  end

  test "ungroupable? is false for a plain idea and for a bundle with no members" do
    idea = create_idea(created_by: @user)
    link!(parent: @trip, child: idea)
    plain = @version.schedule_items.create!(trip: @trip, entry: idea, day: @trip_day.day)
    assert_not plain.ungroupable?

    empty_bundle = place_bundle!
    assert_not empty_bundle.ungroupable?
  end
end
