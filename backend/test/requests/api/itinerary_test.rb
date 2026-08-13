require "test_helper"

class Api::ItineraryTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
    @trip = create_trip(created_by: @user)
    @idea = create_idea(title: "Nanzen-ji", created_by: @user, duration_minutes: 40, location_name: "Nanzen-ji")
    link!(parent: @trip, child: @idea)
  end

  def bundle_with_members!(titles, durations: [])
    bundle = create_bundle(title: "Higashiyama", created_by: @user)
    link!(parent: @trip, child: bundle)
    titles.each_with_index do |title, index|
      member = create_idea(title: title, created_by: @user, duration_minutes: durations[index])
      link!(parent: bundle, child: member, position: index)
    end
    bundle
  end

  def day!(day = "2026-10-12")
    TripDay.ensure!(trip_id: @trip.id, day: day)
  end

  # --- GET /api/trips/:trip_id/itinerary -------------------------------------

  test "GET itinerary returns only days that have a row, in date order" do
    day!("2026-10-13")
    day!("2026-10-11")

    get "/api/trips/#{@trip.id}/itinerary"
    assert_response :success
    days = JSON.parse(response.body)["trip_days"]

    assert_equal ["2026-10-11", "2026-10-13"], days.map { |d| d["day"] }
  end

  test "GET itinerary serializes versions, items, entry summaries and bundle members" do
    bundle = bundle_with_members!(["Ramen", "Kaiseki"])
    trip_day = day!
    version = trip_day.first_live_version
    version.schedule_items.create!(trip: @trip, entry: @idea, day: trip_day.day,
                                   starts_at_minutes: 540, ends_at_minutes: 600)
    version.schedule_items.create!(trip: @trip, entry: bundle, day: trip_day.day,
                                   starts_at_minutes: 1110, ends_at_minutes: 1200)
    archived = trip_day.fork!
    archived.update!(archived_at: Time.current)

    get "/api/trips/#{@trip.id}/itinerary"
    assert_response :success
    row = JSON.parse(response.body)["trip_days"].sole

    assert_equal ["Version A"], row["versions"].map { |v| v["name"] }
    assert_equal ["Version B"], row["archived_versions"].map { |v| v["name"] }
    assert_not_nil row["archived_versions"].first["archived_at"]

    items = row["versions"].first["schedule_items"]
    assert_equal [540, 1110], items.map { |i| i["starts_at_minutes"] }
    assert_equal version.id, items.first["day_version_id"]

    assert_equal(
      { "id" => @idea.id, "kind" => "idea", "title" => "Nanzen-ji", "category" => "place",
        "duration_minutes" => 40, "location_name" => "Nanzen-ji" },
      items.first["entry"]
    )
    assert_empty items.first["members"]
    assert_equal ["Ramen", "Kaiseki"], items.last["members"].map { |m| m["title"] }
  end

  test "GET itinerary requires a signed-in user" do
    delete "/api/session"
    get "/api/trips/#{@trip.id}/itinerary"
    assert_response :unauthorized
  end

  # --- PATCH /api/trips/:trip_id/days/:day -----------------------------------

  test "PATCH day sets lodging from a kept entry and creates the row on demand" do
    hotel = create_idea(title: "Hotel Granvia", category: "lodging", created_by: @user)

    patch "/api/trips/#{@trip.id}/days/2026-10-12",
          params: { trip_day: { lodging_entry_id: hotel.id } }, as: :json
    assert_response :success

    row = JSON.parse(response.body)["trip_day"]
    assert_equal "2026-10-12", row["day"]
    assert_equal hotel.id, row["lodging_entry_id"]
    assert_equal "Hotel Granvia", row["lodging_title"]
    assert_equal ["Version A"], row["versions"].map { |v| v["name"] }
  end

  test "PATCH day accepts free text lodging and clears it when both keys are null" do
    patch "/api/trips/#{@trip.id}/days/2026-10-12",
          params: { trip_day: { lodging_label: "Sleeping on the plane" } }, as: :json
    assert_equal "Sleeping on the plane", JSON.parse(response.body).dig("trip_day", "lodging_title")

    patch "/api/trips/#{@trip.id}/days/2026-10-12",
          params: { trip_day: { lodging_entry_id: nil, lodging_label: nil } }, as: :json
    assert_response :success
    assert_nil JSON.parse(response.body).dig("trip_day", "lodging_title")
  end

  test "PATCH day requires a signed-in user" do
    delete "/api/session"
    patch "/api/trips/#{@trip.id}/days/2026-10-12", params: { trip_day: { lodging_label: "x" } }, as: :json
    assert_response :unauthorized
  end

  # --- POST /api/trips/:trip_id/days/:day/versions ---------------------------

  test "POST versions forks the day and returns the whole day" do
    trip_day = day!
    trip_day.first_live_version.schedule_items.create!(
      trip: @trip, entry: @idea, day: trip_day.day, starts_at_minutes: 540, ends_at_minutes: 600
    )

    post "/api/trips/#{@trip.id}/days/2026-10-12/versions"
    assert_response :created

    row = JSON.parse(response.body)["trip_day"]
    assert_equal ["Version A", "Version B"], row["versions"].map { |v| v["name"] }
    assert_equal [540], row["versions"].last["schedule_items"].map { |i| i["starts_at_minutes"] }
  end

  test "POST versions creates the day when nothing has been placed on it yet" do
    post "/api/trips/#{@trip.id}/days/2026-10-12/versions"
    assert_response :created
    assert_equal ["Version A", "Version B"], JSON.parse(response.body).dig("trip_day", "versions").map { |v| v["name"] }
  end

  test "POST versions requires a signed-in user" do
    delete "/api/session"
    post "/api/trips/#{@trip.id}/days/2026-10-12/versions"
    assert_response :unauthorized
  end

  # --- keep / restore / archive ----------------------------------------------

  test "POST keep archives the siblings and renames the survivor" do
    trip_day = day!
    version_a = trip_day.first_live_version
    version_b = trip_day.fork!

    post "/api/day_versions/#{version_b.id}/keep"
    assert_response :success

    row = JSON.parse(response.body)["trip_day"]
    assert_equal [["Version A", version_b.id]], row["versions"].map { |v| [v["name"], v["id"]] }
    assert_equal [version_a.id], row["archived_versions"].map { |v| v["id"] }
  end

  test "POST restore brings an archived version back under the next free letter" do
    trip_day = day!
    version_a = trip_day.first_live_version
    trip_day.fork!.keep!

    post "/api/day_versions/#{version_a.id}/restore"
    assert_response :success

    row = JSON.parse(response.body)["trip_day"]
    assert_equal ["Version A", "Version B"], row["versions"].map { |v| v["name"] }
    assert_empty row["archived_versions"]
  end

  test "DELETE archives a version rather than destroying it" do
    trip_day = day!
    version_a = trip_day.first_live_version
    version_b = trip_day.fork!

    delete "/api/day_versions/#{version_b.id}"
    assert_response :success

    row = JSON.parse(response.body)["trip_day"]
    assert_equal [version_a.id], row["versions"].map { |v| v["id"] }
    assert_equal [version_b.id], row["archived_versions"].map { |v| v["id"] }
    assert DayVersion.exists?(version_b.id), "archived, never destroyed"
  end

  test "DELETE on the last live version is rejected" do
    trip_day = day!

    delete "/api/day_versions/#{trip_day.first_live_version.id}"
    assert_response :unprocessable_entity
    assert JSON.parse(response.body)["errors"].present?
    assert_nil trip_day.first_live_version.reload.archived_at
  end

  test "keep, restore and delete all require a signed-in user" do
    version = day!.first_live_version
    delete "/api/session"

    post "/api/day_versions/#{version.id}/keep"
    assert_response :unauthorized
    post "/api/day_versions/#{version.id}/restore"
    assert_response :unauthorized
    delete "/api/day_versions/#{version.id}"
    assert_response :unauthorized
  end

  test "an unknown version is a 404" do
    post "/api/day_versions/0/keep"
    assert_response :not_found
  end

  # --- POST /api/schedule_items/:id/ungroup ----------------------------------

  test "POST ungroup replaces the bundle with its members and returns the day" do
    bundle = bundle_with_members!(["Walk", "Lunch"], durations: [60, 120])
    trip_day = day!
    item = trip_day.first_live_version.schedule_items.create!(
      trip: @trip, entry: bundle, day: trip_day.day, starts_at_minutes: 540, ends_at_minutes: 720
    )

    post "/api/schedule_items/#{item.id}/ungroup"
    assert_response :success

    items = JSON.parse(response.body).dig("trip_day", "versions").first["schedule_items"]
    assert_equal ["Walk", "Lunch"], items.map { |i| i.dig("entry", "title") }
    assert_equal [[540, 600], [600, 720]], items.map { |i| [i["starts_at_minutes"], i["ends_at_minutes"]] }
    assert_not ScheduleItem.exists?(item.id)
    assert Entry.exists?(bundle.id), "the bundle entry survives"
  end

  test "POST ungroup on a non-bundle is a 422" do
    trip_day = day!
    item = trip_day.first_live_version.schedule_items.create!(
      trip: @trip, entry: @idea, day: trip_day.day, starts_at_minutes: 540, ends_at_minutes: 600
    )

    post "/api/schedule_items/#{item.id}/ungroup"
    assert_response :unprocessable_entity
    assert ScheduleItem.exists?(item.id)
  end

  test "POST ungroup on a bundle with no members is a 422" do
    bundle = bundle_with_members!([])
    trip_day = day!
    item = trip_day.first_live_version.schedule_items.create!(
      trip: @trip, entry: bundle, day: trip_day.day, starts_at_minutes: 540, ends_at_minutes: 600
    )

    post "/api/schedule_items/#{item.id}/ungroup"
    assert_response :unprocessable_entity
  end

  test "POST ungroup requires a signed-in user" do
    trip_day = day!
    item = trip_day.first_live_version.schedule_items.create!(trip: @trip, entry: @idea, day: trip_day.day)
    delete "/api/session"

    post "/api/schedule_items/#{item.id}/ungroup"
    assert_response :unauthorized
  end
end
