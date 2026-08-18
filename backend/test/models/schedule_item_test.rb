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

  # --- Foreign keys must point inside the trip (tech review H2/H3) ------------
  # entry_id, chosen_entry_id and day_version_id are all writable params, so
  # these validations are what stop a member placing another trip's ids into
  # their own rows.

  test "entry that is a descendant of the trip is valid, nested or not" do
    trip = create_trip
    idea = create_idea
    link!(parent: trip, child: idea)
    bundle = create_bundle
    link!(parent: trip, child: bundle)
    nested = create_idea(title: "Nested")
    link!(parent: bundle, child: nested)

    assert ScheduleItem.new(trip: trip, entry: idea, day: Date.current).valid?
    assert ScheduleItem.new(trip: trip, entry: bundle, chosen_entry: nested, day: Date.current).valid?
  end

  test "entry_id pointing at another user's entry is invalid" do
    trip = create_trip
    stranger = create_user
    their_trip = create_trip(created_by: stranger)
    their_idea = create_idea(title: "Secret hotel", created_by: stranger)
    link!(parent: their_trip, child: their_idea)

    item = ScheduleItem.new(trip: trip, entry_id: their_idea.id, day: Date.current)
    assert_not item.valid?
    assert_includes item.errors[:entry_id], "must belong to this trip"
  end

  test "chosen_entry_id pointing at another user's entry is invalid" do
    trip = create_trip
    bundle = create_bundle
    link!(parent: trip, child: bundle)
    stranger = create_user
    their_trip = create_trip(created_by: stranger)
    their_idea = create_idea(title: "Secret ryokan", created_by: stranger)
    link!(parent: their_trip, child: their_idea)

    item = ScheduleItem.new(trip: trip, entry: bundle, chosen_entry_id: their_idea.id, day: Date.current)
    assert_not item.valid?
    assert_includes item.errors[:chosen_entry_id], "must belong to this trip"
  end

  test "nonexistent entry_id gets the same message as a foreign one (422, no existence oracle, no FK 500)" do
    trip = create_trip
    item = ScheduleItem.new(trip: trip, entry_id: 999_999_999, day: Date.current)
    assert_not item.valid?
    assert_equal [ "must belong to this trip" ], item.errors[:entry_id]
  end

  test "day_version of the same trip is valid" do
    trip = create_trip
    version = TripDay.ensure!(trip_id: trip.id, day: Date.current).first_live_version
    item = ScheduleItem.new(trip: trip, day: Date.current, day_version: version)
    assert item.valid?
  end

  test "day_version belonging to another trip is invalid" do
    trip = create_trip
    other_trip = create_trip(created_by: create_user)
    their_version = TripDay.ensure!(trip_id: other_trip.id, day: Date.current).first_live_version

    item = ScheduleItem.new(trip: trip, day: Date.current, day_version_id: their_version.id)
    assert_not item.valid?
    assert_includes item.errors[:day_version_id], "must belong to this trip"
  end

  test "changing an unrelated field does not re-run the trip-membership walk on untouched FKs" do
    trip = create_trip
    idea = create_idea
    la_link = link!(parent: trip, child: idea)
    item = ScheduleItem.create!(trip: trip, entry: idea, day: Date.current)

    # Break the invariant behind the row's back: if the validation ran on this
    # save it would now fail, so a passing save proves the will_save_change_to_*
    # gate is doing its job for unrelated updates.
    la_link.destroy!
    item.starts_at_minutes = 540
    assert item.save
  end

  test "nil foreign keys remain valid" do
    trip = create_trip
    item = ScheduleItem.new(trip: trip, day: Date.current, entry_id: nil, chosen_entry_id: nil, day_version_id: nil)
    assert item.valid?
  end
end
