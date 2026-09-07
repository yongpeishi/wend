require "test_helper"

# DELETE /api/entries/:id/permanent -- the only path in the product that destroys
# an Entry row.
#
# Three things are being pinned down here, in rising order of how badly they
# would hurt if they broke: that the two preconditions really are enforced by the
# server and not merely by the UI; that the cascade takes exactly what it should
# and nothing that lives somewhere else; and that every inbound foreign key on an
# entry is now handled, since three of them were not and two of those raised
# outright.
class Api::EntryPermanentDeletionsTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user(name: "Owner")
    sign_in_as(@user)
    @trip = create_trip(title: "Japan, spring")
  end

  def archived_idea(title: "Ramen Ichiran", parent: nil, created_by: nil)
    idea = create_idea(title: title, created_by: created_by)
    link!(parent: parent, child: idea) if parent
    idea.archive!
    idea
  end

  # --- Preconditions ---------------------------------------------------------

  test "DELETE /api/entries/:id still only archives, and fires none of the cascades" do
    idea = create_idea(title: "Still here")
    link!(parent: @trip, child: idea)
    Vote.create!(entry: idea, user: @user, score: 2)
    Todo.create!(title: "Book it", entry: idea)
    item = ScheduleItem.create!(trip: @trip, entry: idea, day: "2026-04-01", starts_at_minutes: 540)

    delete "/api/entries/#{idea.id}"
    assert_response :success

    # `dependent:` fires on destroy alone, so nothing below should have moved.
    assert idea.reload.archived_at.present?
    assert_equal 1, Vote.where(entry_id: idea.id).count
    assert_equal 1, Todo.where(entry_id: idea.id).count
    assert_equal idea.id, item.reload.entry_id
    assert_equal 1, EntryLink.where(child_id: idea.id).count
    assert_equal 0, EntryDeletion.count
  end

  test "a live entry is refused: it has to be set aside first" do
    idea = create_idea(title: "Not set aside")
    link!(parent: @trip, child: idea)

    delete "/api/entries/#{idea.id}/permanent", params: { confirm_permanent: "true" }

    assert_response :unprocessable_entity
    assert_equal "must_be_set_aside_first", JSON.parse(response.body)["error"]
    assert Entry.exists?(idea.id)
  end

  # Order matters: a live entry must hear "set it aside first", not "are you
  # sure" -- the second would imply the destroy is one confirmation away.
  test "not-archived is checked before confirmation" do
    idea = create_idea(title: "Not set aside")
    link!(parent: @trip, child: idea)

    delete "/api/entries/#{idea.id}/permanent"

    assert_equal "must_be_set_aside_first", JSON.parse(response.body)["error"]
  end

  test "an unconfirmed attempt is refused, and the refusal is the preview" do
    idea = archived_idea(parent: @trip)
    Vote.create!(entry: idea, user: @user, score: 2)
    Vote.create!(entry: idea, user: create_user(name: "Second"), score: 1)
    Todo.create!(title: "Book it", entry: idea)

    assert_no_difference -> { Entry.count } do
      delete "/api/entries/#{idea.id}/permanent"
    end

    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert_equal "permanent_deletion_needs_confirmation", body["error"]
    assert_equal({
      "title" => "Ramen Ichiran",
      "kind" => "idea",
      "votes_count" => 2,
      "todos_count" => 1,
      "trip_titles" => [ "Japan, spring" ],
      "descendants_destroyed_count" => 0,
      "descendants_surviving_count" => 0,
      "descendants_left_behind_count" => 0
    }, body["preview"])
  end

  test "?confirm_permanent=true destroys the row and answers 204 with no body" do
    idea = archived_idea(parent: @trip)

    delete "/api/entries/#{idea.id}/permanent", params: { confirm_permanent: "true" }

    assert_response :no_content
    assert_empty response.body
    assert_not Entry.exists?(idea.id)
  end

  # `truthy?` is the shared cast every flag in this app goes through: without it
  # a bare present? check would read ?confirm_permanent=false as a yes.
  test "confirm_permanent=false is not a confirmation" do
    idea = archived_idea(parent: @trip)

    delete "/api/entries/#{idea.id}/permanent", params: { confirm_permanent: "false" }

    assert_response :unprocessable_entity
    assert_equal "permanent_deletion_needs_confirmation", JSON.parse(response.body)["error"]
    assert Entry.exists?(idea.id)
  end

  # --- The cascade -----------------------------------------------------------

  test "votes, todos and links on the destroyed entry go with it" do
    idea = archived_idea(parent: @trip)
    Vote.create!(entry: idea, user: @user, score: 2)
    Todo.create!(title: "Book it", entry: idea)

    delete "/api/entries/#{idea.id}/permanent", params: { confirm_permanent: "true" }
    assert_response :no_content

    assert_equal 0, Vote.where(entry_id: idea.id).count
    assert_equal 0, Todo.where(entry_id: idea.id).count
    assert_equal 0, EntryLink.where("parent_id = :id OR child_id = :id", id: idea.id).count
    # The parent is untouched: the link goes, the thing at the other end stays.
    assert Entry.exists?(@trip.id)
  end

  test "a placement of the destroyed entry goes too, rather than being emptied out" do
    idea = archived_idea(parent: @trip)
    item = ScheduleItem.create!(trip: @trip, entry: idea, day: "2026-04-01", starts_at_minutes: 540)

    delete "/api/entries/#{idea.id}/permanent", params: { confirm_permanent: "true" }
    assert_response :no_content

    assert_not ScheduleItem.exists?(item.id), "a placement of a destroyed entry is a ghost row on the day"
  end

  # FK regression #1: schedule_items.chosen_entry_id had no `dependent:` on the
  # Entry side at all, so this raised ActiveRecord::InvalidForeignKey.
  test "a bundle's placement survives its chosen member being destroyed" do
    bundle = create_bundle(title: "Dinner")
    link!(parent: @trip, child: bundle)
    idea = archived_idea(parent: bundle)
    item = ScheduleItem.create!(trip: @trip, entry: bundle, chosen_entry: idea,
                                day: "2026-04-01", starts_at_minutes: 540)

    delete "/api/entries/#{idea.id}/permanent", params: { confirm_permanent: "true" }
    assert_response :no_content

    item.reload
    assert_equal bundle.id, item.entry_id
    assert_nil item.chosen_entry_id, "only the choice inside the bundle is unmade"
  end

  # FK regression #2: entries.from_entry_id / .to_entry_id, same story.
  test "a transport leg survives with a blank end rather than vanishing" do
    from = archived_idea(title: "Tokyo", parent: @trip)
    to = create_idea(title: "Kyoto")
    link!(parent: @trip, child: to)
    leg = create_idea(title: "Shinkansen", category: "transport", from_entry: from, to_entry: to)
    link!(parent: @trip, child: leg)

    delete "/api/entries/#{from.id}/permanent", params: { confirm_permanent: "true" }
    assert_response :no_content

    leg.reload
    assert_nil leg.from_entry_id
    assert_equal to.id, leg.to_entry_id
  end

  test "a day keeps its lodging pill empty rather than going with the lodging entry" do
    ryokan = archived_idea(title: "Ryokan", parent: @trip)
    day = TripDay.ensure!(trip_id: @trip.id, day: "2026-04-01")
    day.update!(lodging_entry_id: ryokan.id)

    delete "/api/entries/#{ryokan.id}/permanent", params: { confirm_permanent: "true" }
    assert_response :no_content

    assert TripDay.exists?(day.id)
    assert_nil day.reload.lodging_entry_id
  end

  test "destroying a trip takes its days, its plan, its trip-level todos and its memberships" do
    friend = create_user(name: "Friend")
    member!(trip: @trip, user: friend)
    idea = create_idea(title: "Only here")
    link!(parent: @trip, child: idea)
    Todo.create!(title: "Visa", trip: @trip)
    day = TripDay.ensure!(trip_id: @trip.id, day: "2026-04-01")
    version = day.first_live_version
    item = ScheduleItem.create!(trip: @trip, entry: idea, day: "2026-04-01",
                                starts_at_minutes: 540, day_version: version)
    @trip.archive!

    delete "/api/entries/#{@trip.id}/permanent", params: { confirm_permanent: "true" }
    assert_response :no_content

    assert_not Entry.exists?(@trip.id)
    assert_not TripDay.exists?(day.id)
    assert_not DayVersion.exists?(version.id)
    assert_not ScheduleItem.exists?(item.id)
    assert_equal 0, Todo.where(trip_id: @trip.id).count
    assert_equal 0, TripMembership.where(trip_id: @trip.id).count
  end

  # --- Which descendants go -------------------------------------------------

  test "a trip takes the ideas that live only in it" do
    only_here = create_idea(title: "Only here")
    deeper = create_idea(title: "Deeper still")
    link!(parent: @trip, child: only_here)
    link!(parent: only_here, child: deeper)
    @trip.archive!

    delete "/api/entries/#{@trip.id}/permanent", params: { confirm_permanent: "true" }
    assert_response :no_content

    assert_not Entry.exists?(only_here.id)
    assert_not Entry.exists?(deeper.id), "depth is no protection: the chain ran through the trip either way"
  end

  test "a descendant that is also in another trip survives, and so does everything under it" do
    other_trip = create_trip(title: "Malaysia 2027")
    shared = create_idea(title: "Shared")
    under_shared = create_idea(title: "Under the shared one")
    link!(parent: @trip, child: shared)
    link!(parent: other_trip, child: shared, position: 1)
    link!(parent: shared, child: under_shared)
    @trip.archive!

    delete "/api/entries/#{@trip.id}/permanent", params: { confirm_permanent: "true" }
    assert_response :no_content

    assert Entry.exists?(shared.id), "an idea in two trips is one row in both -- deleting one trip must not take it"
    assert Entry.exists?(under_shared.id), "survival propagates down: its chain reaches the other trip too"
    assert_equal [ other_trip.id ], EntryLink.where(child_id: shared.id).pluck(:parent_id)
  end

  test "the preview splits the subtree into what goes and what stays" do
    other_trip = create_trip(title: "Malaysia 2027")
    doomed = create_idea(title: "Only here")
    link!(parent: @trip, child: doomed)
    link!(parent: doomed, child: create_idea(title: "Under the doomed one"))
    shared = create_idea(title: "Shared")
    link!(parent: @trip, child: shared, position: 1)
    link!(parent: other_trip, child: shared)
    Vote.create!(entry: doomed, user: @user, score: 2)
    Vote.create!(entry: shared, user: @user, score: 2)
    Todo.create!(title: "Visa", trip: @trip)
    @trip.archive!

    delete "/api/entries/#{@trip.id}/permanent"

    preview = JSON.parse(response.body)["preview"]
    assert_equal 2, preview["descendants_destroyed_count"]
    assert_equal 1, preview["descendants_surviving_count"]
    assert_equal 0, preview["descendants_left_behind_count"]
    # Counts what goes, not what exists: the survivor's vote is not mourned.
    assert_equal 1, preview["votes_count"]
    assert_equal 1, preview["todos_count"]
    # A trip is not inside anything, so it names no trips.
    assert_equal [], preview["trip_titles"]
  end

  test "trip_titles names every trip the entry is in, and only the ones the caller can see" do
    mine = create_trip(title: "Malaysia 2027")
    theirs = create_trip(title: "SecretTripNobodyToldMeAbout", created_by: create_user(name: "Stranger"))
    idea = archived_idea(parent: @trip)
    link!(parent: mine, child: idea, position: 1)
    link!(parent: theirs, child: idea, position: 2)

    delete "/api/entries/#{idea.id}/permanent"

    preview = JSON.parse(response.body)["preview"]
    assert_equal [ "Japan, spring", "Malaysia 2027" ], preview["trip_titles"]
    assert_not_includes response.body, "SecretTripNobodyToldMeAbout"
  end

  test "a library entry names no trips" do
    idea = archived_idea(title: "Kept, not yet in a trip")

    delete "/api/entries/#{idea.id}/permanent"

    assert_equal [], JSON.parse(response.body).dig("preview", "trip_titles")
  end

  # --- The cascade filter ----------------------------------------------------
  #
  # The wrinkle "the creator may delete their own work" opens: a member deleting
  # their own idea must not sweep away a sub-idea somebody else wrote, on
  # authority they never had over it.

  test "a co-traveller's sub-idea is left behind rather than destroyed, and counted" do
    member = create_user(name: "Member")
    member!(trip: @trip, user: member)
    sign_in_as(member)

    mine = create_idea(title: "My idea", created_by: member)
    link!(parent: @trip, child: mine)
    theirs = create_idea(title: "Their sub-idea", created_by: @user)
    link!(parent: mine, child: theirs)
    mine.archive!

    delete "/api/entries/#{mine.id}/permanent"
    preview = JSON.parse(response.body)["preview"]
    assert_equal 0, preview["descendants_destroyed_count"]
    assert_equal 0, preview["descendants_surviving_count"]
    assert_equal 1, preview["descendants_left_behind_count"]

    delete "/api/entries/#{mine.id}/permanent", params: { confirm_permanent: "true" }
    assert_response :no_content

    assert_not Entry.exists?(mine.id)
    assert Entry.exists?(theirs.id), "someone else's work is left alive, not destroyed on authority nobody had"
    # With its only parent gone it falls back to the library, where its own
    # creator can still reach it.
    assert_equal 0, EntryLink.where(child_id: theirs.id).count
  end

  test "the trip's owner has nothing filtered out from under them" do
    member = create_user(name: "Member")
    member!(trip: @trip, user: member)
    theirs = create_idea(title: "Written by the member", created_by: member)
    link!(parent: @trip, child: theirs)
    @trip.archive!

    delete "/api/entries/#{@trip.id}/permanent"
    assert_equal 1, JSON.parse(response.body).dig("preview", "descendants_destroyed_count")

    delete "/api/entries/#{@trip.id}/permanent", params: { confirm_permanent: "true" }
    assert_response :no_content
    assert_not Entry.exists?(theirs.id)
  end

  # --- Authority -------------------------------------------------------------

  test "a member may not destroy a co-traveller's idea, and hears 404 rather than 403" do
    member = create_user(name: "Member")
    member!(trip: @trip, user: member)
    idea = archived_idea(parent: @trip, created_by: @user)
    sign_in_as(member)

    delete "/api/entries/#{idea.id}/permanent", params: { confirm_permanent: "true" }

    assert_response :not_found
    assert Entry.exists?(idea.id)
  end

  test "a member may destroy the idea they wrote in someone else's trip" do
    member = create_user(name: "Member")
    member!(trip: @trip, user: member)
    idea = archived_idea(title: "Mine", parent: @trip, created_by: member)
    sign_in_as(member)

    delete "/api/entries/#{idea.id}/permanent", params: { confirm_permanent: "true" }

    assert_response :no_content
    assert_not Entry.exists?(idea.id)
  end

  # --- Audit -----------------------------------------------------------------

  test "one audit row per destroy, carrying what the row said before it went" do
    idea = create_idea(title: "Only here")
    link!(parent: @trip, child: idea)
    @trip.archive!

    assert_difference -> { EntryDeletion.count }, 1 do
      delete "/api/entries/#{@trip.id}/permanent", params: { confirm_permanent: "true" }
    end
    assert_response :no_content

    row = EntryDeletion.last
    assert_equal @user.id, row.user_id
    assert_equal @trip.id, row.entry_id
    assert_equal "trip", row.kind
    assert_equal "Japan, spring", row.title
    assert_equal 1, row.descendants_destroyed
    assert row.deleted_at.present?
  end

  test "a refused attempt writes no audit row" do
    idea = archived_idea(parent: @trip)

    assert_no_difference -> { EntryDeletion.count } do
      delete "/api/entries/#{idea.id}/permanent"
      delete "/api/entries/#{create_idea.id}/permanent", params: { confirm_permanent: "true" }
    end
  end

  test "the audit row is append-only" do
    idea = archived_idea(parent: @trip)
    delete "/api/entries/#{idea.id}/permanent", params: { confirm_permanent: "true" }

    row = EntryDeletion.last
    assert_raises(ActiveRecord::ReadOnlyRecord) { row.update!(title: "Rewritten") }
    assert_raises(ActiveRecord::ReadOnlyRecord) { row.destroy }
  end

  # --- Atomicity -------------------------------------------------------------

  test "the count the preview promised is the count the destroy reports" do
    doomed = create_idea(title: "Only here")
    link!(parent: @trip, child: doomed)
    link!(parent: doomed, child: create_idea(title: "Deeper"))
    @trip.archive!

    promised = EntryPermanentDeletion.new(@trip, @user).preview["descendants_destroyed_count"]
    assert_equal promised, EntryPermanentDeletion.new(@trip.reload, @user).destroy!
  end
end
