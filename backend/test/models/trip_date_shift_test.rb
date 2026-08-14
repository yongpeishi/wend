require "test_helper"

class TripDateShiftTest < ActiveSupport::TestCase
  setup do
    @user = create_user
    @trip = create_trip(created_by: @user, starts_on: "2026-08-09", ends_on: "2026-08-14")
  end

  # One trip_day with one placed item on every single date of the trip: this is
  # the shape that makes the unique index on [trip_id, day] bite, because every
  # date a row could move onto is already taken by its neighbour.
  def plan_every_day!(from: @trip.starts_on, to: @trip.ends_on)
    (from..to).map do |day|
      trip_day = TripDay.ensure!(trip_id: @trip.id, day: day)
      idea = create_idea(title: "Idea #{day}", created_by: @user)
      link!(parent: @trip, child: idea)
      trip_day.first_live_version.schedule_items.create!(trip: @trip, entry: idea, day: day)
      trip_day
    end
  end

  # A kept idea of this trip -- linked, because the rail only ever lists what
  # the trip holds.
  def idea!(title)
    idea = create_idea(title: title, created_by: @user)
    link!(parent: @trip, child: idea)
    idea
  end

  # One placement in the day's first live version, the way the UI writes them.
  def place!(day, entry)
    trip_day = TripDay.ensure!(trip_id: @trip.id, day: day)
    trip_day.first_live_version.schedule_items.create!(trip: @trip, entry: entry, day: trip_day.day)
  end

  def shift_for(attrs)
    TripDateShift.for(@trip, attrs)
  end

  def planned_dates
    TripDay.for_trip(@trip.id).pluck(:day)
  end

  def item_dates
    ScheduleItem.where(trip_id: @trip.id).order(:day).pluck(:day)
  end

  test "shifting a fully planned trip forward by one day moves every row without a collision" do
    plan_every_day!

    shift_for("starts_on" => "2026-08-10", "ends_on" => "2026-08-15").apply!

    assert_equal (Date.new(2026, 8, 10)..Date.new(2026, 8, 15)).to_a, planned_dates
    assert_equal (Date.new(2026, 8, 10)..Date.new(2026, 8, 15)).to_a, item_dates
  end

  test "shifting a fully planned trip back by one day moves every row without a collision" do
    plan_every_day!

    shift_for("starts_on" => "2026-08-08", "ends_on" => "2026-08-13").apply!

    assert_equal (Date.new(2026, 8, 8)..Date.new(2026, 8, 13)).to_a, planned_dates
    assert_equal (Date.new(2026, 8, 8)..Date.new(2026, 8, 13)).to_a, item_dates
  end

  test "the planned day is kept: Day 2 is still Day 2 after the start moves" do
    day_two = TripDay.ensure!(trip_id: @trip.id, day: "2026-08-10")

    shift_for("starts_on" => "2026-08-19", "ends_on" => "2026-08-24").apply!

    # Day 2 of 19-24 Aug is the 20th.
    assert_equal Date.new(2026, 8, 20), day_two.reload.day
  end

  test "a trip with no previous start has nothing to preserve, so nothing moves" do
    trip = create_trip(created_by: @user)
    trip_day = TripDay.ensure!(trip_id: trip.id, day: "2026-08-10")
    shift = TripDateShift.for(trip, "starts_on" => "2026-08-09", "ends_on" => "2026-08-14")

    assert_equal 0, shift.shift_days
    shift.apply!
    assert_equal Date.new(2026, 8, 10), trip_day.reload.day
  end

  test "changing only ends_on shifts nothing but still drops what falls off the end" do
    kept = TripDay.ensure!(trip_id: @trip.id, day: "2026-08-10")
    dropped = TripDay.ensure!(trip_id: @trip.id, day: "2026-08-14")
    shift = shift_for("ends_on" => "2026-08-12")

    assert_equal 0, shift.shift_days
    assert_equal [Date.new(2026, 8, 14)], shift.dropped_days

    shift.apply!
    assert_equal Date.new(2026, 8, 10), kept.reload.day
    assert_not TripDay.exists?(dropped.id)
  end

  test "dropped days are reported post-shift, ascending, with the ideas that come back" do
    two_rows = idea!("Nishiki")
    one_row = idea!("Kiyamachi")
    place!("2026-08-13", two_rows)
    place!("2026-08-13", two_rows)
    place!("2026-08-14", one_row)

    # Start moves +2, end stays: the 13th and 14th land on the 15th and 16th.
    shift = shift_for("starts_on" => "2026-08-11")

    assert_equal [Date.new(2026, 8, 15), Date.new(2026, 8, 16)], shift.dropped_days
    # Three rows go, but only two ideas land back on the rail.
    assert_equal 3, ScheduleItem.where(trip_id: @trip.id).count
    assert_equal 2, shift.dropped_entry_count
  end

  # The count is what the modal promises: ideas returning to "Not placed yet".
  # Every case below is one where that differs from the number of rows going.

  test "an idea placed on a surviving day too is still placed, so it does not count" do
    idea = idea!("Nanzen-ji")
    place!("2026-08-10", idea)
    place!("2026-08-14", idea)

    shift = shift_for("ends_on" => "2026-08-12")

    assert_equal [Date.new(2026, 8, 14)], shift.dropped_days
    assert_equal 0, shift.dropped_entry_count
  end

  test "one idea placed twice on the same dropped day comes back once" do
    idea = idea!("Kiyamachi")
    place!("2026-08-14", idea)
    place!("2026-08-14", idea)

    assert_equal 1, shift_for("ends_on" => "2026-08-12").dropped_entry_count
  end

  test "a row in an archived version is destroyed, but the user sees nothing come back" do
    only_archived = idea!("Coffee at Weekenders")
    trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-08-14")
    archived = trip_day.fork!
    archived.update!(archived_at: Time.current)
    item = archived.schedule_items.create!(trip: @trip, entry: only_archived, day: trip_day.day)

    shift = shift_for("ends_on" => "2026-08-12")
    # It was never on a day the rail could see, so it was already on the rail.
    assert_equal 0, shift.dropped_entry_count

    shift.apply!
    assert_not ScheduleItem.exists?(item.id), "the row goes with the day like any other"
  end

  test "an idea in a live version on the dropped day counts even if an archived one holds it elsewhere" do
    idea = idea!("Nanzen-ji")
    kept_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-08-10")
    archived = kept_day.fork!
    archived.update!(archived_at: Time.current)
    archived.schedule_items.create!(trip: @trip, entry: idea, day: kept_day.day)
    place!("2026-08-14", idea)

    # The surviving placement is one nothing on the itinerary shows, so the
    # idea does come back to the rail.
    assert_equal 1, shift_for("ends_on" => "2026-08-12").dropped_entry_count
  end

  test "a bundle counts as the one thing the rail lists, not as its members" do
    bundle = create_bundle(title: "Nishiki market crawl", created_by: @user)
    link!(parent: @trip, child: bundle)
    2.times { |i| link!(parent: bundle, child: create_idea(title: "Member #{i}", created_by: @user), position: i) }
    place!("2026-08-14", bundle)

    assert_equal 1, shift_for("ends_on" => "2026-08-12").dropped_entry_count
  end

  test "an archived idea is not counted -- the rail never lists it" do
    idea = idea!("Uji")
    place!("2026-08-14", idea)
    idea.archive!

    assert_equal 0, shift_for("ends_on" => "2026-08-12").dropped_entry_count
  end

  test "no dropped days means nothing comes back, whatever is placed" do
    place!("2026-08-10", idea!("Nanzen-ji"))

    assert_equal 0, shift_for("ends_on" => "2026-08-20").dropped_entry_count
  end

  test "a write that names neither date never drops a day, even an out-of-range one" do
    TripDay.ensure!(trip_id: @trip.id, day: "2026-09-30")

    shift = shift_for("title" => "Renamed")

    assert_equal 0, shift.shift_days
    assert_empty shift.dropped_days
  end

  test "dropping destroys the placements and the day, and no Entry at all" do
    idea = create_idea(created_by: @user)
    link!(parent: @trip, child: idea)
    trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-08-14")
    version = trip_day.first_live_version
    item = version.schedule_items.create!(trip: @trip, entry: idea, day: trip_day.day)

    shift_for("ends_on" => "2026-08-12").apply!

    assert_not ScheduleItem.exists?(item.id)
    assert_not TripDay.exists?(trip_day.id)
    assert_not DayVersion.exists?(version.id)
    assert Entry.exists?(idea.id), "the idea is kept -- it goes back to Not placed yet"
  end

  test "a shift leaves day_version_id and archived versions alone" do
    idea = create_idea(created_by: @user)
    link!(parent: @trip, child: idea)
    trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-08-10")
    version_a = trip_day.first_live_version
    item = version_a.schedule_items.create!(trip: @trip, entry: idea, day: trip_day.day)
    archived = trip_day.fork!
    archived.update!(archived_at: Time.current)

    shift_for("starts_on" => "2026-08-11", "ends_on" => "2026-08-16").apply!

    assert_equal version_a.id, item.reload.day_version_id
    assert_equal Date.new(2026, 8, 12), item.day
    assert_nil version_a.reload.archived_at
    assert_not_nil archived.reload.archived_at
    assert_equal ["Version A", "Version B"], trip_day.day_versions.reload.order(:position).map(&:name)
  end
end
