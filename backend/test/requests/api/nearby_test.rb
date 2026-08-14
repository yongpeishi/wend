require "test_helper"

class Api::NearbyTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
    @trip = create_trip(created_by: @user)
  end

  test "requires access to the trip" do
    theirs = create_trip(created_by: create_user)

    get "/api/trips/#{theirs.id}/nearby", params: { lat: 35.0, lng: 135.7594, radius_km: 5 }
    assert_response :not_found
  end

  test "returns entries within radius_km with distance_km, ordered nearest first" do
    # Kyoto station area
    near = create_idea(title: "Near", created_by: @user, lat: 35.0000, lng: 135.7594)
    # ~1.2km away
    mid = create_idea(title: "Mid", created_by: @user, lat: 35.0100, lng: 135.7594)
    # Tokyo, far away
    far = create_idea(title: "Far", created_by: @user, lat: 35.6762, lng: 139.6503)
    [near, mid, far].each { |e| link!(parent: @trip, child: e) }

    get "/api/trips/#{@trip.id}/nearby", params: { lat: 35.0000, lng: 135.7594, radius_km: 5 }
    assert_response :success
    body = JSON.parse(response.body)["entries"]
    ids = body.map { |e| e["id"] }

    assert_includes ids, near.id
    assert_includes ids, mid.id
    assert_not_includes ids, far.id
    assert body.first["distance_km"] <= body.last["distance_km"]
  end

  test "exclude_scheduled=true drops entries already on the schedule" do
    a = create_idea(title: "A", created_by: @user, lat: 35.0, lng: 135.75)
    b = create_idea(title: "B", created_by: @user, lat: 35.0001, lng: 135.7501)
    [a, b].each { |e| link!(parent: @trip, child: e) }
    ScheduleItem.create!(trip: @trip, entry: a, day: "2026-04-01", starts_at_minutes: 600)

    get "/api/trips/#{@trip.id}/nearby", params: { lat: 35.0, lng: 135.75, radius_km: 5, exclude_scheduled: "true" }
    ids = JSON.parse(response.body)["entries"].map { |e| e["id"] }
    assert_not_includes ids, a.id
    assert_includes ids, b.id
  end
end
