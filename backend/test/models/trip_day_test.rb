require "test_helper"

class TripDayTest < ActiveSupport::TestCase
  setup do
    @user = create_user
    @trip = create_trip(created_by: @user)
    @idea = create_idea(created_by: @user)
    link!(parent: @trip, child: @idea)
  end

  test "ensure! creates the day with a single Version A, and is idempotent" do
    trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-12")

    assert_equal Date.new(2026, 10, 12), trip_day.day
    assert_equal ["Version A"], trip_day.day_versions.map(&:name)
    assert_equal [0], trip_day.day_versions.map(&:position)

    again = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-12")
    assert_equal trip_day.id, again.id
    assert_equal 1, again.day_versions.count
  end

  test "a trip may not have two rows for the same day" do
    TripDay.create!(trip: @trip, day: "2026-10-12")
    duplicate = TripDay.new(trip: @trip, day: "2026-10-12")

    assert_not duplicate.valid?
    assert_includes duplicate.errors.attribute_names, :trip_id
  end

  test "fork! walks the letters A -> B -> C by the count of versions ever on the day" do
    trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-12")

    assert_equal "Version B", trip_day.fork!.name
    assert_equal "Version C", trip_day.fork!.name
    assert_equal ["Version A", "Version B", "Version C"], trip_day.day_versions.reload.map(&:name)
    assert_equal [0, 1, 2], trip_day.day_versions.map(&:position)
  end

  test "fork! copies every schedule item of the last live version" do
    trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-12")
    source = trip_day.first_live_version
    source.schedule_items.create!(
      trip: @trip, entry: @idea, day: trip_day.day,
      starts_at_minutes: 540, ends_at_minutes: 600, note: "morning", position: 3
    )

    forked = trip_day.fork!
    copy = forked.schedule_items.reload.sole

    assert_equal @idea.id, copy.entry_id
    assert_equal 540, copy.starts_at_minutes
    assert_equal 600, copy.ends_at_minutes
    assert_equal "morning", copy.note
    assert_equal 3, copy.position
    assert_equal trip_day.day, copy.day
    # The source keeps its own item -- forking duplicates, it does not move.
    assert_equal 1, source.schedule_items.reload.count
  end

  test "fork! on an empty day makes an empty version rather than failing" do
    trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-12")
    forked = trip_day.fork!

    assert_equal "Version B", forked.name
    assert_empty forked.schedule_items
  end

  test "lodging_title prefers the kept entry over the free text" do
    place = create_idea(title: "Hotel Granvia", category: "lodging", created_by: @user)
    trip_day = TripDay.create!(trip: @trip, day: "2026-10-12", lodging_label: "Sleeping on the plane")

    assert_equal "Sleeping on the plane", trip_day.lodging_title

    trip_day.update!(lodging_entry: place)
    assert_equal "Hotel Granvia", trip_day.lodging_title

    trip_day.update!(lodging_entry: nil, lodging_label: nil)
    assert_nil trip_day.lodging_title
  end
end
