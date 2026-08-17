require "test_helper"

class Api::ScheduleItemsTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
    @trip = create_trip(created_by: @user)
    @idea = create_idea(created_by: @user)
    link!(parent: @trip, child: @idea)
  end

  # PATCH and DELETE /api/schedule_items/:id carry no trip_id, so the row's own trip
  # is the only authority there is.
  test "requires access to the trip, including on the routes that carry no trip_id" do
    their_trip = create_trip(created_by: create_user)
    their_item = ScheduleItem.create!(trip: their_trip, day: "2026-04-01", starts_at_minutes: 540)

    get "/api/trips/#{their_trip.id}/schedule"
    assert_response :not_found

    post "/api/trips/#{their_trip.id}/schedule", params: { schedule_item: { day: "2026-04-01" } }, as: :json
    assert_response :not_found

    patch "/api/schedule_items/#{their_item.id}", params: { schedule_item: { starts_at_minutes: 600 } }, as: :json
    assert_response :not_found

    delete "/api/schedule_items/#{their_item.id}"
    assert_response :not_found
    assert ScheduleItem.exists?(their_item.id)
  end

  test "POST creates a schedule item for a trip" do
    post "/api/trips/#{@trip.id}/schedule",
         params: { schedule_item: { entry_id: @idea.id, day: "2026-04-01", starts_at_minutes: 540, ends_at_minutes: 600 } },
         as: :json
    assert_response :created
    body = JSON.parse(response.body)
    assert_equal @trip.id, body.dig("schedule_item", "trip_id")
    assert_equal 540, body.dig("schedule_item", "starts_at_minutes")
  end

  test "POST rejects ends_at_minutes before starts_at_minutes" do
    post "/api/trips/#{@trip.id}/schedule",
         params: { schedule_item: { entry_id: @idea.id, day: "2026-04-01", starts_at_minutes: 600, ends_at_minutes: 500 } },
         as: :json
    assert_response :unprocessable_entity
  end

  test "GET filters by day" do
    ScheduleItem.create!(trip: @trip, entry: @idea, day: "2026-04-01", starts_at_minutes: 540)
    ScheduleItem.create!(trip: @trip, entry: @idea, day: "2026-04-02", starts_at_minutes: 540)

    get "/api/trips/#{@trip.id}/schedule", params: { day: "2026-04-01" }
    assert_response :success
    body = JSON.parse(response.body)["schedule_items"]
    assert_equal 1, body.size
    assert_equal "2026-04-01", body.first["day"]
  end

  test "PATCH updates a schedule item" do
    item = ScheduleItem.create!(trip: @trip, entry: @idea, day: "2026-04-01", starts_at_minutes: 540)
    patch "/api/schedule_items/#{item.id}", params: { schedule_item: { starts_at_minutes: 600 } }, as: :json
    assert_response :success
    assert_equal 600, JSON.parse(response.body).dig("schedule_item", "starts_at_minutes")
  end

  test "DELETE removes a schedule item" do
    item = ScheduleItem.create!(trip: @trip, entry: @idea, day: "2026-04-01", starts_at_minutes: 540)
    delete "/api/schedule_items/#{item.id}"
    assert_response :no_content
    assert_not ScheduleItem.exists?(item.id)
  end

  # --- day_version resolution -------------------------------------------------
  # The final-schedule screen posts a bare `day` and knows nothing about
  # versions. It must keep working unchanged.

  test "POST with no day_version_id lands on the day's first live version, creating it" do
    post "/api/trips/#{@trip.id}/schedule",
         params: { schedule_item: { entry_id: @idea.id, day: "2026-04-01", starts_at_minutes: 540 } },
         as: :json
    assert_response :created

    version_id = JSON.parse(response.body).dig("schedule_item", "day_version_id")
    assert_not_nil version_id

    trip_day = TripDay.find_by!(trip_id: @trip.id, day: "2026-04-01")
    assert_equal trip_day.first_live_version.id, version_id
    assert_equal ["Version A"], trip_day.day_versions.map(&:name)
  end

  test "POST twice on the same day reuses the one trip_day and version" do
    2.times do
      post "/api/trips/#{@trip.id}/schedule",
           params: { schedule_item: { entry_id: @idea.id, day: "2026-04-01", starts_at_minutes: 540 } },
           as: :json
      assert_response :created
    end

    assert_equal 1, TripDay.where(trip_id: @trip.id, day: "2026-04-01").count
    assert_equal 1, ScheduleItem.where(trip_id: @trip.id, day: "2026-04-01").distinct.count(:day_version_id)
  end

  test "POST with an explicit day_version_id uses it and fills in the day" do
    trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-04-01")
    version = trip_day.fork!

    post "/api/trips/#{@trip.id}/schedule",
         params: { schedule_item: { entry_id: @idea.id, day_version_id: version.id, starts_at_minutes: 540 } },
         as: :json
    assert_response :created

    body = JSON.parse(response.body)["schedule_item"]
    assert_equal version.id, body["day_version_id"]
    assert_equal "2026-04-01", body["day"]
  end

  test "POST with an unknown day_version_id is a 422, not a 500" do
    post "/api/trips/#{@trip.id}/schedule",
         params: { schedule_item: { entry_id: @idea.id, day: "2026-04-01", day_version_id: 0 } },
         as: :json
    assert_response :unprocessable_entity
    assert JSON.parse(response.body).dig("errors", "day_version_id").present?
  end

  test "PATCH moving an item to another day re-resolves its version" do
    item = ScheduleItem.create!(trip: @trip, entry: @idea, day: "2026-04-01", starts_at_minutes: 540)

    patch "/api/schedule_items/#{item.id}", params: { schedule_item: { day: "2026-04-02" } }, as: :json
    assert_response :success

    version_id = JSON.parse(response.body).dig("schedule_item", "day_version_id")
    assert_equal TripDay.find_by!(trip_id: @trip.id, day: "2026-04-02").first_live_version.id, version_id
  end

  test "PATCH accepts an explicit day_version_id" do
    item = ScheduleItem.create!(trip: @trip, entry: @idea, day: "2026-04-01", starts_at_minutes: 540)
    other = TripDay.ensure!(trip_id: @trip.id, day: "2026-04-01").fork!

    patch "/api/schedule_items/#{item.id}", params: { schedule_item: { day_version_id: other.id } }, as: :json
    assert_response :success
    assert_equal other.id, JSON.parse(response.body).dig("schedule_item", "day_version_id")
  end

  test "an entry becomes scheduled once a schedule_item references it, directly or as chosen bundle member" do
    bundle = create_bundle(created_by: @user)
    link!(parent: @trip, child: bundle)
    option_a = create_idea(title: "Ramen", created_by: @user)
    link!(parent: bundle, child: option_a)

    get "/api/entries", params: { trip_id: @trip.id }
    row = JSON.parse(response.body)["entries"].find { |e| e["id"] == option_a.id }
    assert_equal false, row["scheduled"]

    ScheduleItem.create!(trip: @trip, entry: bundle, chosen_entry_id: option_a.id, day: "2026-04-01", starts_at_minutes: 1080)

    get "/api/entries", params: { trip_id: @trip.id }
    row = JSON.parse(response.body)["entries"].find { |e| e["id"] == option_a.id }
    assert_equal true, row["scheduled"]
  end
end
