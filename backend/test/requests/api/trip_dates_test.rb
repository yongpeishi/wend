require "test_helper"

# PATCH /api/entries/:id when the entry is a trip and the dates move. The plan
# travels with the dates; days pushed off the end need confirming first, and
# the attempt itself is the preview -- there is no separate endpoint.
class Api::TripDatesTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
    @trip = create_trip(created_by: @user, starts_on: "2026-08-09", ends_on: "2026-08-14")
    @idea = create_idea(title: "Nanzen-ji", created_by: @user)
    link!(parent: @trip, child: @idea)
  end

  def place!(day, entry: @idea)
    trip_day = TripDay.ensure!(trip_id: @trip.id, day: day)
    trip_day.first_live_version.schedule_items.create!(trip: @trip, entry: entry, day: trip_day.day)
    trip_day
  end

  # `:unset` leaves the key out of the body entirely, which is not the same as
  # sending it as null.
  def patch_dates(starts_on: :unset, ends_on: :unset, confirm: nil, **extra)
    entry = {}
    entry[:starts_on] = starts_on unless starts_on == :unset
    entry[:ends_on] = ends_on unless ends_on == :unset
    body = { entry: entry.merge(extra) }
    body[:confirm_dropped_days] = confirm unless confirm.nil?
    patch "/api/entries/#{@trip.id}", params: body, as: :json
  end

  def planned_dates
    TripDay.for_trip(@trip.id).pluck(:day).map(&:iso8601)
  end

  test "moving the start forward carries the whole plan with it" do
    place!("2026-08-09")
    place!("2026-08-10")

    patch_dates(starts_on: "2026-08-19", ends_on: "2026-08-24")
    assert_response :success

    assert_equal ["2026-08-19", "2026-08-20"], planned_dates
    assert_equal ["2026-08-19", "2026-08-20"], ScheduleItem.where(trip_id: @trip.id).order(:day).pluck(:day).map(&:iso8601)
  end

  test "moving the start back by one day on a fully planned trip does not hit the unique index" do
    (Date.new(2026, 8, 9)..Date.new(2026, 8, 14)).each { |day| place!(day) }

    patch_dates(starts_on: "2026-08-08", ends_on: "2026-08-13")
    assert_response :success

    assert_equal (Date.new(2026, 8, 8)..Date.new(2026, 8, 13)).map(&:iso8601), planned_dates
  end

  test "the success response is still just the serialized entry" do
    place!("2026-08-10")

    patch_dates(starts_on: "2026-08-10", ends_on: "2026-08-15")
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal ["entry"], body.keys
    assert_equal @trip.id, body["entry"]["id"]
    assert_equal "2026-08-10", body["entry"]["starts_on"]
  end

  test "a trip with no start yet just takes the dates, moving nothing" do
    trip = create_trip(created_by: @user)
    trip_day = TripDay.ensure!(trip_id: trip.id, day: "2026-08-10")

    patch "/api/entries/#{trip.id}",
          params: { entry: { starts_on: "2026-08-09", ends_on: "2026-08-14" } }, as: :json
    assert_response :success

    assert_equal Date.new(2026, 8, 10), trip_day.reload.day
  end

  test "shrinking the trip is refused with the days it would drop and how much is on them" do
    place!("2026-08-10")
    dropped = place!("2026-08-13")
    place!("2026-08-14")

    patch_dates(starts_on: "2026-08-09", ends_on: "2026-08-12")
    assert_response :unprocessable_entity

    body = JSON.parse(response.body)
    assert_equal "dropped_days_need_confirmation", body["error"]
    assert_equal ["2026-08-13", "2026-08-14"], body["dropped_days"]
    assert_equal 2, body["dropped_item_count"]

    # Nothing at all changed.
    assert_equal Date.new(2026, 8, 14), @trip.reload.ends_on
    assert_equal ["2026-08-10", "2026-08-13", "2026-08-14"], planned_dates
    assert TripDay.exists?(dropped.id)
    assert_equal 3, ScheduleItem.where(trip_id: @trip.id).count
  end

  test "a refusal reports the days post-shift, not where they are today" do
    place!("2026-08-13")

    # +2 shift: the 13th becomes the 15th, past the unchanged 14th.
    patch_dates(starts_on: "2026-08-11")
    assert_response :unprocessable_entity
    assert_equal ["2026-08-15"], JSON.parse(response.body)["dropped_days"]
  end

  test "confirming drops the placements and returns the ideas to Not placed yet" do
    orphan = create_idea(title: "Uji", created_by: @user)
    link!(parent: @trip, child: orphan)
    kept = place!("2026-08-10")
    dropped = place!("2026-08-14", entry: orphan)

    patch_dates(starts_on: "2026-08-09", ends_on: "2026-08-12", confirm: true)
    assert_response :success

    assert_equal Date.new(2026, 8, 12), @trip.reload.ends_on
    assert_equal ["2026-08-10"], planned_dates
    assert TripDay.exists?(kept.id)
    assert_not TripDay.exists?(dropped.id)
    assert_equal 1, ScheduleItem.where(trip_id: @trip.id).count
    assert Entry.exists?(orphan.id), "the idea is kept, only its placement went away"

    get "/api/entries", params: { trip_id: @trip.id, scheduled: false }
    unplaced = JSON.parse(response.body)["entries"].map { |e| e["id"] }
    assert_includes unplaced, orphan.id
    assert_not_includes unplaced, @idea.id
  end

  test "confirming shifts first, so only what really falls off the end goes" do
    place!("2026-08-09")
    place!("2026-08-14")

    # Everything moves +1; the 15th is past the new end, the 10th is not.
    patch_dates(starts_on: "2026-08-10", ends_on: "2026-08-14", confirm: true)
    assert_response :success

    assert_equal ["2026-08-10"], planned_dates
  end

  test "changing only ends_on shifts nothing but still checks for dropped days" do
    place!("2026-08-10")
    place!("2026-08-14")

    patch_dates(ends_on: "2026-08-12", starts_on: :unset)
    assert_response :unprocessable_entity
    assert_equal ["2026-08-14"], JSON.parse(response.body)["dropped_days"]

    patch_dates(ends_on: "2026-08-12", starts_on: :unset, confirm: true)
    assert_response :success
    assert_equal ["2026-08-10"], planned_dates
    assert_equal Date.new(2026, 8, 9), @trip.reload.starts_on
  end

  test "growing the trip drops nothing and needs no confirmation" do
    place!("2026-08-14")

    patch_dates(starts_on: "2026-08-09", ends_on: "2026-08-20")
    assert_response :success
    assert_equal ["2026-08-14"], planned_dates
  end

  test "a write that touches no date leaves an already out-of-range day alone" do
    stray = place!("2026-09-30")

    patch "/api/entries/#{@trip.id}", params: { entry: { title: "Kyoto" } }, as: :json
    assert_response :success

    assert_equal "Kyoto", @trip.reload.title
    assert TripDay.exists?(stray.id)
  end

  test "a date-only change leaves versions and their archiving untouched" do
    trip_day = place!("2026-08-10")
    version_a = trip_day.first_live_version
    archived = trip_day.fork!
    archived.update!(archived_at: Time.current)
    item = version_a.schedule_items.first

    patch_dates(starts_on: "2026-08-10", ends_on: "2026-08-15")
    assert_response :success

    assert_equal version_a.id, item.reload.day_version_id
    assert_equal Date.new(2026, 8, 11), item.day
    assert_nil version_a.reload.archived_at
    assert_not_nil archived.reload.archived_at
  end
end
