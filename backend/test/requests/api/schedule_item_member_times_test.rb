require "test_helper"

class Api::ScheduleItemMemberTimesTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
    @trip = create_trip
    @bundle = create_bundle(title: "Higashiyama")
    link!(parent: @trip, child: @bundle)
    @ramen = create_idea(title: "Ramen")
    @kaiseki = create_idea(title: "Kaiseki")
    link!(parent: @bundle, child: @ramen, position: 0)
    link!(parent: @bundle, child: @kaiseki, position: 1)
    @trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-10-12")
    @item = @trip_day.first_live_version.schedule_items.create!(
      trip: @trip, entry: @bundle, day: @trip_day.day, starts_at_minutes: 540, ends_at_minutes: 720
    )
  end

  def patch_member(item, entry, starts, ends)
    patch "/api/schedule_items/#{item.id}/members/#{entry.id}",
          params: { member_time: { starts_at_minutes: starts, ends_at_minutes: ends } }, as: :json
  end

  def member_times
    JSON.parse(response.body).dig("schedule_item", "member_times")
  end

  # The route carries no trip_id, so the row's own trip is the only authority.
  test "404 for a placement outside the caller's trips" do
    stranger = create_user
    their_trip = create_trip(created_by: stranger)
    their_bundle = create_bundle(created_by: stranger)
    link!(parent: their_trip, child: their_bundle)
    their_member = create_idea(created_by: stranger)
    link!(parent: their_bundle, child: their_member)
    their_item = ScheduleItem.create!(trip: their_trip, entry: their_bundle, day: "2026-10-12")

    patch_member(their_item, their_member, 540, 600)

    assert_response :not_found
    assert_equal 0, ScheduleItemMemberTime.count
  end

  test "404 for a viewer of the trip" do
    viewer = create_user
    member!(trip: @trip, user: viewer, role: "viewer")
    sign_in_as(viewer)

    patch_member(@item, @ramen, 540, 600)

    assert_response :not_found
    assert_equal 0, ScheduleItemMemberTime.count
  end

  test "requires a signed-in user" do
    delete "/api/session"
    patch_member(@item, @ramen, 540, 600)
    assert_response :unauthorized
  end

  test "422 when the entry is not a member of the plan" do
    loose = create_idea(title: "Loose")
    link!(parent: @trip, child: loose)

    patch_member(@item, loose, 540, 600)

    assert_response :unprocessable_entity
    assert_equal({ "errors" => { "entry_id" => ["Entry must be a member of this plan"] } }, JSON.parse(response.body))
    assert_equal 0, ScheduleItemMemberTime.count
  end

  test "422 when the placement is a plain idea, not a plan" do
    idea = create_idea(title: "Nanzen-ji")
    link!(parent: @trip, child: idea)
    item = @trip_day.first_live_version.schedule_items.create!(trip: @trip, entry: idea, day: @trip_day.day)

    patch_member(item, @ramen, 540, 600)

    assert_response :unprocessable_entity
    assert_equal ["Entry must be a member of this plan"], JSON.parse(response.body).dig("errors", "entry_id")
  end

  test "422 when ends comes before starts" do
    patch_member(@item, @ramen, 600, 540)

    assert_response :unprocessable_entity
    assert_equal ["Ends at minutes must be greater than or equal to starts_at_minutes"],
                 JSON.parse(response.body).dig("errors", "ends_at_minutes")
    assert_equal 0, ScheduleItemMemberTime.count
  end

  test "PATCH times a member and answers with the item in its itinerary shape" do
    patch_member(@item, @kaiseki, 1110, 1200)

    assert_response :success
    item = JSON.parse(response.body)["schedule_item"]
    assert_equal @item.id, item["id"]
    assert_equal "Higashiyama", item.dig("entry", "title")
    assert_equal ["Ramen", "Kaiseki"], item["members"].map { |m| m["title"] }
    assert_equal [{ "entry_id" => @kaiseki.id, "starts_at_minutes" => 1110, "ends_at_minutes" => 1200 }],
                 item["member_times"]
    # The band's own span is separately editable and untouched by a member's hours.
    assert_equal [540, 720], item.values_at("starts_at_minutes", "ends_at_minutes")
    assert_equal 1, ScheduleItemMemberTime.count
  end

  test "PATCH re-times a member that already has hours, one row per member" do
    @item.member_times.create!(entry: @ramen, starts_at_minutes: 540, ends_at_minutes: 600)

    patch_member(@item, @ramen, 555, nil)

    assert_response :success
    assert_equal [{ "entry_id" => @ramen.id, "starts_at_minutes" => 555, "ends_at_minutes" => nil }], member_times
    assert_equal 1, @item.member_times.count
  end

  test "member_times comes back in member order whatever order they were set in" do
    patch_member(@item, @kaiseki, 1110, 1200)
    patch_member(@item, @ramen, 540, 600)

    assert_response :success
    assert_equal [@ramen.id, @kaiseki.id], member_times.map { |t| t["entry_id"] }
  end

  test "both nulls take the row away and leave member_times empty" do
    @item.member_times.create!(entry: @ramen, starts_at_minutes: 540, ends_at_minutes: 600)

    patch_member(@item, @ramen, nil, nil)

    assert_response :success
    assert_equal [], member_times
    assert_equal 0, ScheduleItemMemberTime.count
  end

  test "both nulls on a member nobody timed is a quiet no-op" do
    patch_member(@item, @ramen, nil, nil)

    assert_response :success
    assert_equal [], member_times
    assert_equal 0, ScheduleItemMemberTime.count
  end

  test "both nulls on a non-member is still refused" do
    loose = create_idea(title: "Loose")
    link!(parent: @trip, child: loose)

    patch_member(@item, loose, nil, nil)

    assert_response :unprocessable_entity
    assert_equal ["Entry must be a member of this plan"], JSON.parse(response.body).dig("errors", "entry_id")
  end

  test "taking a timed member out of the plan takes its hours off the itinerary too" do
    patch_member(@item, @ramen, 540, 600)
    patch_member(@item, @kaiseki, 660, 720)

    delete "/api/entries/#{@bundle.id}/links/#{@ramen.id}"
    assert_response :no_content

    get "/api/trips/#{@trip.id}/itinerary"
    item = JSON.parse(response.body)["trip_days"].sole["versions"].first["schedule_items"].sole
    assert_equal ["Kaiseki"], item["members"].map { |m| m["title"] }
    assert_equal [@kaiseki.id], item["member_times"].map { |t| t["entry_id"] }
    assert_equal [@kaiseki.id], ScheduleItemMemberTime.pluck(:entry_id)
  end

  test "a trip member, not only the owner, may time a member" do
    collaborator = create_user
    member!(trip: @trip, user: collaborator, role: "member")
    sign_in_as(collaborator)

    patch_member(@item, @ramen, 540, 600)

    assert_response :success
    assert_equal [@ramen.id], member_times.map { |t| t["entry_id"] }
  end
end
