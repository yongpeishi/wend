require "test_helper"

class Api::ScheduleItemsTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
    @trip = create_trip(created_by: @user)
    @idea = create_idea(created_by: @user)
    link!(parent: @trip, child: @idea)
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
