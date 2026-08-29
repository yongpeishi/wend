require "test_helper"
require "digest/sha1"

class UserCalendarsTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user(name: "Sarah")
    @trip = create_trip(title: "Kyoto", created_by: @user)
    @idea = create_idea(
      title: "Nanzen-ji",
      description: "Walk through the temple grounds",
      address: "86 Nanzenji Fukuchi-cho, Kyoto",
      lat: 35.0114,
      lng: 135.7945,
      duration_minutes: 60,
      created_by: @user
    )
    link!(parent: @trip, child: @idea)

    trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-12")
    trip_day.first_live_version.schedule_items.create!(
      trip: @trip,
      entry: @idea,
      day: trip_day.day,
      starts_at_minutes: 9 * 60,
      ends_at_minutes: 10 * 60,
      note: "Meet by the main gate"
    )
  end

  test "a valid token returns the user's itinerary as an iCalendar feed" do
    get "/users/#{@user.id}/ical", params: { auth: token_for(@user) }

    assert_response :success
    assert_equal "text/calendar; charset=utf-8", response.content_type
    assert_includes response.headers["Content-Disposition"], "sarah-itinerary.ics"

    calendar = response.body
    assert_includes calendar, "BEGIN:VCALENDAR\r\n"
    assert_includes calendar, "X-WR-CALNAME:Sarah's Wend itineraries\r\n"
    assert_includes calendar, "SUMMARY:Nanzen-ji\r\n"
    assert_includes calendar, "DESCRIPTION:Walk through the temple grounds\r\n"
    assert_includes calendar, "LOCATION:86 Nanzenji Fukuchi-cho\\, Kyoto\r\n"
    assert_includes calendar, "GEO:35.0114;135.7945\r\n"
    assert_includes calendar, "DTSTART:20261012T090000\r\n"
    assert_includes calendar, "DTEND:20261012T100000\r\n"
    assert_includes calendar, "END:VCALENDAR\r\n"
  end

  test "the feed is available without a signed-in session" do
    get "/users/#{@user.id}/ical", params: { auth: token_for(@user) }

    assert_response :success
  end

  test "a missing or incorrect token reveals neither user nor calendar" do
    get "/users/#{@user.id}/ical"
    assert_response :not_found
    assert_empty response.body

    get "/users/#{@user.id}/ical", params: { auth: "wrong" }
    assert_response :not_found
    assert_empty response.body

    get "/users/0/ical", params: { auth: token_for(@user) }
    assert_response :not_found
    assert_empty response.body
  end

  test "changing the password invalidates the old calendar token" do
    old_token = token_for(@user)
    @user.update!(password: "new-password")

    get "/users/#{@user.id}/ical", params: { auth: old_token }
    assert_response :not_found

    get "/users/#{@user.id}/ical", params: { auth: token_for(@user) }
    assert_response :success
  end

  test "the feed includes every trip the user belongs to but no other user's trip" do
    shared_trip = create_trip(title: "Osaka", created_by: create_user)
    member!(trip: shared_trip, user: @user, role: "viewer")
    shared_idea = create_idea(title: "Osaka Castle", created_by: shared_trip.created_by)
    link!(parent: shared_trip, child: shared_idea)
    shared_day = TripDay.ensure!(trip_id: shared_trip.id, day: "2026-10-13")
    shared_day.first_live_version.schedule_items.create!(
      trip: shared_trip, entry: shared_idea, day: shared_day.day,
      starts_at_minutes: 11 * 60, ends_at_minutes: 12 * 60
    )

    other_trip = create_trip(title: "Tokyo", created_by: create_user)
    other_idea = create_idea(title: "Private dinner", created_by: other_trip.created_by)
    link!(parent: other_trip, child: other_idea)
    other_day = TripDay.ensure!(trip_id: other_trip.id, day: "2026-10-14")
    other_day.first_live_version.schedule_items.create!(
      trip: other_trip, entry: other_idea, day: other_day.day,
      starts_at_minutes: 18 * 60, ends_at_minutes: 19 * 60
    )

    get "/users/#{@user.id}/ical", params: { auth: token_for(@user) }

    assert_response :success
    assert_includes response.body, "SUMMARY:Nanzen-ji\r\n"
    assert_includes response.body, "SUMMARY:Osaka Castle\r\n"
    assert_not_includes response.body, "Private dinner"
  end

  test "the feed emits the chosen bundle member and only the final live version" do
    bundle = create_bundle(title: "Dinner options", created_by: @user)
    ramen = create_idea(title: "Ramen", description: "Chosen dinner", created_by: @user)
    sushi = create_idea(title: "Sushi", created_by: @user)
    link!(parent: @trip, child: bundle)
    link!(parent: bundle, child: ramen)
    link!(parent: bundle, child: sushi)

    day = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-13")
    version_a = day.first_live_version
    version_a.schedule_items.create!(
      trip: @trip, entry: bundle, chosen_entry: ramen, day: day.day,
      starts_at_minutes: 18 * 60, ends_at_minutes: 19 * 60
    )
    version_b = day.fork!
    version_b.schedule_items.sole.update!(chosen_entry: sushi)

    get "/users/#{@user.id}/ical", params: { auth: token_for(@user) }

    assert_response :success
    assert_includes response.body, "SUMMARY:Ramen\r\n"
    assert_includes response.body, "DESCRIPTION:Chosen dinner\r\n"
    assert_not_includes response.body, "SUMMARY:Sushi\r\n"
  end

  test "untimed items are all-day events and missing ends use the entry duration" do
    untimed = create_idea(title: "Wander", created_by: @user)
    timed = create_idea(title: "Tea", duration_minutes: 45, created_by: @user)
    link!(parent: @trip, child: untimed)
    link!(parent: @trip, child: timed)
    day = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-15")
    day.first_live_version.schedule_items.create!(trip: @trip, entry: untimed, day: day.day)
    day.first_live_version.schedule_items.create!(
      trip: @trip, entry: timed, day: day.day, starts_at_minutes: 14 * 60
    )

    get "/users/#{@user.id}/ical", params: { auth: token_for(@user) }

    assert_response :success
    wander = event_for("Wander")
    assert_includes wander, "DTSTART;VALUE=DATE:20261015\r\n"
    assert_includes wander, "DTEND;VALUE=DATE:20261016\r\n"
    tea = event_for("Tea")
    assert_includes tea, "DTSTART:20261015T140000\r\n"
    assert_includes tea, "DTEND:20261015T144500\r\n"
  end

  test "calendar text is escaped and folded to valid iCalendar lines" do
    @idea.update!(
      title: "Temple, garden; and tea",
      description: "First line\nSecond \\ line " + ("with a long description " * 5),
      address: "1 Main St; Kyoto"
    )

    get "/users/#{@user.id}/ical", params: { auth: token_for(@user) }

    assert_response :success
    assert_includes response.body, "SUMMARY:Temple\\, garden\\; and tea\r\n"
    assert_includes response.body, "DESCRIPTION:First line\\nSecond \\ line"
    assert_includes response.body, "LOCATION:1 Main St\\; Kyoto\r\n"
    assert response.body.split("\r\n").all? { |line| line.bytesize <= 75 }, "iCalendar lines must be at most 75 octets"
    assert_match(/\r\n /, response.body)
  end

  private

  def token_for(user)
    Digest::SHA1.hexdigest("#{user.id}#{user.password_digest}")
  end

  def event_for(summary)
    response.body.scan(/BEGIN:VEVENT\r\n.*?END:VEVENT\r\n/m).find { |event| event.include?("SUMMARY:#{summary}\r\n") }
  end
end
