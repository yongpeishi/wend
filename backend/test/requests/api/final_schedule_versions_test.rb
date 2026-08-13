require "test_helper"

# Regression tests for a bug that reached a real browser.
#
# The 014 Itinerary feature gave every day one or more `day_versions`, so a day
# can carry two plans side by side while they are compared, plus the archived
# ones the user rejected. `GET /api/trips/:trip_id/schedule` -- which powers the
# older Final schedule screen, the dark surface people read while actually
# travelling -- kept returning every schedule_item on the day regardless of the
# version it belonged to. Two things a user saw:
#
#   1. Fork a day and every item came back twice, stacked on the same grid.
#   2. A day whose Version B had been archived still showed Version B's items.
#      A plan explicitly rejected reappeared on the travelling screen.
#
# The rule now, per ScheduleItem.in_final_plan: the Final schedule reads exactly
# one plan per day -- the day's FIRST LIVE version (lowest `position` among
# those with `archived_at IS NULL`) -- plus any item with a NULL
# `day_version_id`, which are legacy rows predating the feature.
#
# The sibling rule, ScheduleItem.placed, answers a different question: "is this
# entry placed anywhere yet?", for which ANY live version counts (a fork under
# comparison should not put both of its alternatives back on the unplaced rail).
# An archived version counts for neither.
class Api::FinalScheduleVersionsTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
    @trip = create_trip(created_by: @user)
    @day = "2026-04-01"
  end

  # --- The forked day: one plan, not two -------------------------------------

  test "a forked day returns each item once, not twice" do
    place("Nanzen-ji", at: 540)
    place("Kiyamachi", at: 1080)
    trip_day.fork!

    # Both live versions hold a copy, so the day now has four rows in total...
    assert_equal 4, ScheduleItem.where(trip_id: @trip.id, day: @day).count
    assert_equal 2, trip_day.live_versions.count

    # ...but the Final schedule is one plan, so it sees two.
    assert_equal ["Kiyamachi", "Nanzen-ji"], final_schedule_titles.sort
  end

  test "a forked day's Final schedule is the first live version, not the fork" do
    place("Nanzen-ji", at: 540)
    forked = trip_day.fork!
    ScheduleItem.create!(trip: @trip, entry: create_idea(title: "Only in B", created_by: @user),
                         day: @day, day_version: forked, starts_at_minutes: 600)

    titles = final_schedule_titles
    assert_equal ["Nanzen-ji"], titles
    assert_not_includes titles, "Only in B"
  end

  # --- The archived version: gone from the finished plan ----------------------

  test "an archived version's items never appear on the Final schedule" do
    place("Nanzen-ji", at: 540)
    forked = trip_day.fork!
    rejected = create_idea(title: "Rejected plan", created_by: @user)
    ScheduleItem.create!(trip: @trip, entry: rejected, day: @day, day_version: forked, starts_at_minutes: 660)

    forked.archive!
    assert forked.reload.archived?

    # The row is kept -- archiving is not deleting -- it is simply not read.
    assert ScheduleItem.exists?(entry_id: rejected.id, day_version_id: forked.id)
    assert_not_includes final_schedule_titles, "Rejected plan"
  end

  test "archiving the FIRST live version hands the Final schedule the next one" do
    first = trip_day.first_live_version
    second = trip_day.fork!
    ScheduleItem.create!(trip: @trip, entry: create_idea(title: "In A", created_by: @user),
                         day: @day, day_version: first, starts_at_minutes: 540)
    ScheduleItem.create!(trip: @trip, entry: create_idea(title: "In B", created_by: @user),
                         day: @day, day_version: second, starts_at_minutes: 600)

    assert_equal ["In A"], final_schedule_titles

    first.archive!
    # "First live" is recomputed, never remembered: B is now the only live one.
    assert_equal ["In B"], final_schedule_titles
  end

  # --- Keeping a version changes what the Final schedule says ----------------

  test "keeping a version drops the loser from the Final schedule" do
    first = trip_day.first_live_version
    winner = trip_day.fork!
    ScheduleItem.create!(trip: @trip, entry: create_idea(title: "Loser", created_by: @user),
                         day: @day, day_version: first, starts_at_minutes: 540)
    ScheduleItem.create!(trip: @trip, entry: create_idea(title: "Winner", created_by: @user),
                         day: @day, day_version: winner, starts_at_minutes: 600)

    assert_equal ["Loser"], final_schedule_titles

    post "/api/day_versions/#{winner.id}/keep"
    assert_response :success

    assert_equal ["Winner"], final_schedule_titles
  end

  test "restoring an archived version does not put its items back on the Final schedule" do
    place("Nanzen-ji", at: 540)
    forked = trip_day.fork!
    ScheduleItem.create!(trip: @trip, entry: create_idea(title: "Second thoughts", created_by: @user),
                         day: @day, day_version: forked, starts_at_minutes: 660)
    forked.archive!

    post "/api/day_versions/#{forked.id}/restore"
    assert_response :success

    # Restored means "back on the table to compare", not "back in the plan":
    # it is appended after the first live version, which still wins.
    assert_equal 2, trip_day.live_versions.count
    assert_equal ["Nanzen-ji"], final_schedule_titles
  end

  # --- Legacy rows: no version at all ----------------------------------------

  test "items with a null day_version_id still appear" do
    legacy = ScheduleItem.create!(trip: @trip, entry: create_idea(title: "Legacy row", created_by: @user),
                                  day: @day, starts_at_minutes: 480)
    assert_nil legacy.day_version_id

    assert_includes final_schedule_titles, "Legacy row"
  end

  test "a null day_version_id survives a fork and an archive on the same day" do
    ScheduleItem.create!(trip: @trip, entry: create_idea(title: "Legacy row", created_by: @user),
                         day: @day, starts_at_minutes: 480)
    place("Nanzen-ji", at: 540)
    trip_day.fork!.archive!

    assert_equal ["Legacy row", "Nanzen-ji"], final_schedule_titles.sort
  end

  # --- The ?day= filter sees the same one plan -------------------------------

  test "the ?day= filter returns one plan for that day too" do
    place("Nanzen-ji", at: 540)
    trip_day.fork!

    get "/api/trips/#{@trip.id}/schedule", params: { day: @day }
    assert_response :success
    items = JSON.parse(response.body)["schedule_items"]
    assert_equal 1, items.size
    assert_equal @day, items.first["day"]
  end

  test "a day with no versions at all is unaffected by another day's fork" do
    place("Nanzen-ji", at: 540)
    other = ScheduleItem.create!(trip: @trip, entry: create_idea(title: "Next day", created_by: @user),
                                 day: "2026-04-02", starts_at_minutes: 540)
    trip_day.fork!

    assert_equal ["Nanzen-ji", "Next day"], final_schedule_titles.sort
    assert_equal @trip.id, other.trip_id
  end

  # --- The same leak in `scheduled` ------------------------------------------
  # An entry that survives nowhere but an archived version has been rejected: it
  # belongs back on the rail, not marked "decided" on the board and map.

  test "an entry only in an archived version reads as not scheduled" do
    idea = create_idea(title: "Rejected", created_by: @user)
    link!(parent: @trip, child: idea)
    forked = trip_day.fork!
    ScheduleItem.create!(trip: @trip, entry: idea, day: @day, day_version: forked, starts_at_minutes: 600)

    assert_equal true, entry_row(idea)["scheduled"]
    assert_includes scheduled_titles(true), "Rejected"

    forked.archive!

    assert_equal false, entry_row(idea)["scheduled"]
    assert_includes scheduled_titles(false), "Rejected"
    assert_not_includes scheduled_titles(true), "Rejected"
  end

  test "an entry in a second LIVE version still reads as scheduled" do
    idea = create_idea(title: "Only in B", created_by: @user)
    link!(parent: @trip, child: idea)
    forked = trip_day.fork!
    ScheduleItem.create!(trip: @trip, entry: idea, day: @day, day_version: forked, starts_at_minutes: 600)

    # It is off the itinerary's unplaced rail (it sits in a live version), even
    # though the Final schedule does not show it yet -- these are two different
    # questions, ScheduleItem.placed and ScheduleItem.in_final_plan.
    assert_equal true, entry_row(idea)["scheduled"]
    assert_not_includes final_schedule_titles, "Only in B"
  end

  test "a chosen bundle member in an archived version reads as not scheduled" do
    bundle = create_bundle(created_by: @user)
    link!(parent: @trip, child: bundle)
    option = create_idea(title: "Ramen", created_by: @user)
    link!(parent: bundle, child: option)

    forked = trip_day.fork!
    ScheduleItem.create!(trip: @trip, entry: bundle, chosen_entry_id: option.id,
                         day: @day, day_version: forked, starts_at_minutes: 1080)
    assert_equal true, entry_row(option)["scheduled"]

    forked.archive!
    assert_equal false, entry_row(option)["scheduled"]
  end

  private

  def trip_day
    TripDay.ensure!(trip_id: @trip.id, day: @day)
  end

  # Places an idea through the public write path, which resolves the day's first
  # live version exactly as the Final schedule screen's own POST does.
  def place(title, at:)
    idea = create_idea(title: title, created_by: @user)
    link!(parent: @trip, child: idea)
    post "/api/trips/#{@trip.id}/schedule",
         params: { schedule_item: { entry_id: idea.id, day: @day, starts_at_minutes: at } },
         as: :json
    assert_response :created
    idea
  end

  def final_schedule_titles
    get "/api/trips/#{@trip.id}/schedule"
    assert_response :success
    JSON.parse(response.body)["schedule_items"].map { |item| Entry.find(item["entry_id"]).title }
  end

  def entry_row(entry)
    get "/api/entries", params: { trip_id: @trip.id }
    assert_response :success
    JSON.parse(response.body)["entries"].find { |e| e["id"] == entry.id }
  end

  def scheduled_titles(want)
    get "/api/entries", params: { trip_id: @trip.id, scheduled: want }
    assert_response :success
    JSON.parse(response.body)["entries"].map { |e| e["title"] }
  end
end
