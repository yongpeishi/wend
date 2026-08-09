require "test_helper"

class ScheduleItemTest < ActiveSupport::TestCase
  test "requires a trip and a day" do
    item = ScheduleItem.new
    assert_not item.valid?
    assert_includes item.errors.attribute_names, :trip
    assert_includes item.errors.attribute_names, :day
  end

  test "starts_at_minutes and ends_at_minutes must be within 0..1439" do
    trip = create_trip
    item = ScheduleItem.new(trip: trip, day: Date.current, starts_at_minutes: -1)
    assert_not item.valid?

    item2 = ScheduleItem.new(trip: trip, day: Date.current, ends_at_minutes: 1440)
    assert_not item2.valid?

    item3 = ScheduleItem.new(trip: trip, day: Date.current, starts_at_minutes: 0, ends_at_minutes: 1439)
    assert item3.valid?
  end

  test "ends_at_minutes must be >= starts_at_minutes when both present" do
    trip = create_trip
    item = ScheduleItem.new(trip: trip, day: Date.current, starts_at_minutes: 600, ends_at_minutes: 500)
    assert_not item.valid?
    assert_includes item.errors.attribute_names, :ends_at_minutes
  end

  test "unscheduled (null starts_at_minutes) is valid" do
    trip = create_trip
    item = ScheduleItem.new(trip: trip, day: Date.current)
    assert item.valid?
  end

  test "equal starts and ends is valid (zero-length placeholder)" do
    trip = create_trip
    item = ScheduleItem.new(trip: trip, day: Date.current, starts_at_minutes: 600, ends_at_minutes: 600)
    assert item.valid?
  end
end
