require "test_helper"
require Rails.root.join("db/migrate/20260813090002_add_day_version_to_schedule_items")

# Exercises the migration's backfill directly against real rows. The column is
# nullable, so items with no version are exactly what the migration finds in a
# database written before it ran.
class DayVersionBackfillTest < ActiveSupport::TestCase
  setup do
    @user = create_user
    @trip = create_trip(created_by: @user)
    @other_trip = create_trip(title: "Other", created_by: @user)
    @idea = create_idea(created_by: @user)
    link!(parent: @trip, child: @idea)
  end

  def legacy_item!(trip: @trip, day:, starts: nil)
    ScheduleItem.create!(trip: trip, entry: @idea, day: day, starts_at_minutes: starts)
  end

  # Without this the migration narrates every statement into the test output.
  def backfill!
    ActiveRecord::Migration.suppress_messages { AddDayVersionToScheduleItems.new.backfill! }
  end

  test "backfill gives every distinct trip and day one trip_day holding one Version A" do
    morning = legacy_item!(day: "2026-10-12", starts: 540)
    afternoon = legacy_item!(day: "2026-10-12", starts: 840)
    next_day = legacy_item!(day: "2026-10-13", starts: 540)
    other = legacy_item!(trip: @other_trip, day: "2026-10-12", starts: 540)

    backfill!

    [morning, afternoon, next_day, other].each(&:reload)
    assert_not_nil morning.day_version_id
    assert_equal morning.day_version_id, afternoon.day_version_id, "same day, same version"
    assert_not_equal morning.day_version_id, next_day.day_version_id, "different day, different version"
    assert_not_equal morning.day_version_id, other.day_version_id, "different trip, different version"

    trip_day = TripDay.find_by!(trip_id: @trip.id, day: "2026-10-12")
    assert_equal ["Version A"], trip_day.day_versions.map(&:name)
    assert_equal [0], trip_day.day_versions.map(&:position)
    assert_equal trip_day.id, morning.day_version.trip_day_id
    assert_equal 2, TripDay.where(trip_id: @trip.id).count
  end

  test "backfill leaves items that already have a version alone and is safe to re-run" do
    trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-12")
    forked = trip_day.fork!
    placed = forked.schedule_items.create!(trip: @trip, entry: @idea, day: trip_day.day)
    legacy = legacy_item!(day: "2026-10-12", starts: 540)

    backfill!

    assert_equal forked.id, placed.reload.day_version_id
    # The legacy row joins the day's first live version, not a second one.
    assert_equal trip_day.first_live_version.id, legacy.reload.day_version_id
    assert_equal 2, trip_day.day_versions.reload.count

    assert_nothing_raised { backfill! }
    assert_equal 2, trip_day.day_versions.reload.count
    assert_equal 1, TripDay.where(trip_id: @trip.id).count
  end
end
