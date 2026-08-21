require "test_helper"

class Api::ItineraryTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
    @trip = create_trip(created_by: @user)
    @idea = create_idea(title: "Nanzen-ji", created_by: @user, duration_minutes: 40)
    link!(parent: @trip, child: @idea)
  end

  def bundle_with_members!(titles)
    bundle = create_bundle(title: "Higashiyama", created_by: @user)
    link!(parent: @trip, child: bundle)
    titles.each_with_index do |title, index|
      member = create_idea(title: title, created_by: @user)
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
        "duration_minutes" => 40},
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
    link!(parent: @trip, child: hotel)

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

  test "PATCH day refuses an entry from someone else's trip without leaking its title" do
    stranger = create_user
    other_trip = create_trip(created_by: stranger)
    secret = create_idea(title: "Secret Ryokan", created_by: stranger)
    link!(parent: other_trip, child: secret)

    patch "/api/trips/#{@trip.id}/days/2026-10-12",
          params: { trip_day: { lodging_entry_id: secret.id } }, as: :json

    assert_response :unprocessable_entity
    # The whole point of the validation: a rejected id must not read back the
    # victim's title through lodging_title.
    assert_no_match(/Secret Ryokan/, response.body)
    assert_match(/must belong to this trip/, JSON.parse(response.body).dig("errors", "lodging_entry_id").sole)
  end

  test "PATCH day with a nonexistent lodging id is a 422, indistinguishable from a foreign one" do
    patch "/api/trips/#{@trip.id}/days/2026-10-12",
          params: { trip_day: { lodging_entry_id: Entry.maximum(:id).to_i + 1 } }, as: :json

    assert_response :unprocessable_entity
    assert_match(/must belong to this trip/, JSON.parse(response.body).dig("errors", "lodging_entry_id").sole)
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

  # --- POST /api/trips/:trip_id/itinerary/swap_days --------------------------

  def dated_trip!
    @trip.update!(starts_on: "2026-10-10", ends_on: "2026-10-15")
    @trip
  end

  def plan!(day, title:, lodging: nil)
    trip_day = day!(day)
    trip_day.update!(lodging_label: lodging) if lodging
    idea = create_idea(title: title, created_by: @user)
    link!(parent: @trip, child: idea)
    trip_day.first_live_version.schedule_items.create!(trip: @trip, entry: idea, day: trip_day.day)
    trip_day
  end

  def swap!(a, b)
    post "/api/trips/#{@trip.id}/itinerary/swap_days", params: { a: a, b: b }, as: :json
  end

  def titles_by_day
    JSON.parse(response.body)["trip_days"].to_h do |row|
      [row["day"], row["versions"].flat_map { |v| v["schedule_items"].map { |i| i.dig("entry", "title") } }]
    end
  end

  test "swap_days exchanges two planned days, lodging and all" do
    dated_trip!
    day_two = plan!("2026-10-11", title: "Nijo", lodging: "Hotel A")
    day_three = plan!("2026-10-12", title: "Fushimi", lodging: "Hotel B")

    swap!("2026-10-11", "2026-10-12")
    assert_response :success

    assert_equal({ "2026-10-11" => ["Fushimi"], "2026-10-12" => ["Nijo"] }, titles_by_day)
    assert_equal Date.new(2026, 10, 12), day_two.reload.day
    assert_equal Date.new(2026, 10, 11), day_three.reload.day
    assert_equal "Hotel A", day_two.lodging_label
    assert_equal "Hotel B", day_three.lodging_label
  end

  test "swap_days moves a plan onto an empty date and leaves the old one empty" do
    dated_trip!
    day_two = plan!("2026-10-11", title: "Nijo", lodging: "Hotel A")

    swap!("2026-10-11", "2026-10-13")
    assert_response :success

    assert_equal({ "2026-10-13" => ["Nijo"] }, titles_by_day)
    assert_equal Date.new(2026, 10, 13), day_two.reload.day
    assert_nil TripDay.find_by(trip_id: @trip.id, day: "2026-10-11")
  end

  test "swap_days returns the whole trip in date order" do
    dated_trip!
    plan!("2026-10-10", title: "Arrive")
    plan!("2026-10-11", title: "Nijo")
    plan!("2026-10-14", title: "Leave")

    swap!("2026-10-11", "2026-10-14")
    assert_response :success

    assert_equal ["2026-10-10", "2026-10-11", "2026-10-14"],
                 JSON.parse(response.body)["trip_days"].map { |d| d["day"] }
    assert_equal ["Arrive"], titles_by_day["2026-10-10"]
    assert_equal ["Leave"], titles_by_day["2026-10-11"]
    assert_equal ["Nijo"], titles_by_day["2026-10-14"]
  end

  test "swap_days keeps each item on its own version" do
    dated_trip!
    trip_day = plan!("2026-10-11", title: "Nijo")
    version = trip_day.first_live_version
    item = version.schedule_items.sole

    swap!("2026-10-11", "2026-10-12")
    assert_response :success

    assert_equal version.id, item.reload.day_version_id
    assert_equal Date.new(2026, 10, 12), item.day
    assert_equal Date.new(2026, 10, 12), version.reload.trip_day.day
  end

  test "swap_days on the same date is a no-op" do
    dated_trip!
    plan!("2026-10-11", title: "Nijo")

    swap!("2026-10-11", "2026-10-11")
    assert_response :success
    assert_equal({ "2026-10-11" => ["Nijo"] }, titles_by_day)
  end

  test "swap_days refuses a date outside the trip" do
    dated_trip!
    plan!("2026-10-11", title: "Nijo")

    swap!("2026-10-11", "2026-10-16")
    assert_response :unprocessable_entity
    assert_equal "day_outside_trip", JSON.parse(response.body)["error"]
    assert_equal Date.new(2026, 10, 11), TripDay.for_trip(@trip.id).sole.day
  end

  test "swap_days refuses when the trip has no dates at all" do
    day!("2026-10-11")

    swap!("2026-10-11", "2026-10-12")
    assert_response :unprocessable_entity
    assert_equal "day_outside_trip", JSON.parse(response.body)["error"]
  end

  test "swap_days rejects a date it cannot parse" do
    dated_trip!

    swap!("2026-10-11", "not-a-date")
    assert_response :unprocessable_entity
    assert_equal "invalid_day", JSON.parse(response.body)["error"]
  end

  test "swap_days requires a signed-in user" do
    dated_trip!
    delete "/api/session"

    swap!("2026-10-11", "2026-10-12")
    assert_response :unauthorized
  end
end
