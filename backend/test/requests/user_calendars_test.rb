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

  private

  def token_for(user)
    Digest::SHA1.hexdigest("#{user.id}#{user.password_digest}")
  end
end
