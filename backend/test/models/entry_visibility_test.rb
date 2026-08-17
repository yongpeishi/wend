require "test_helper"

# There are no fixture YAMLs in this repo despite `fixtures :all`, so each test
# builds the shape it is about.
class EntryVisibilityTest < ActiveSupport::TestCase
  setup do
    @sarah = create_user(name: "Sarah")
    @peter = create_user(name: "Peter")
    @stranger = create_user(name: "Stranger")
  end

  def visible_ids(user)
    Entry.visible_to(user).pluck(:id)
  end

  test "a trip is visible to everyone on it and to nobody else" do
    trip = create_trip(title: "Japan", created_by: @sarah)
    member!(trip: trip, user: @peter, role: "viewer")

    assert_includes visible_ids(@sarah), trip.id
    assert_includes visible_ids(@peter), trip.id
    assert_not_includes visible_ids(@stranger), trip.id
  end

  test "visibility descends the whole subtree, whoever wrote each row" do
    trip = create_trip(title: "Japan", created_by: @sarah)
    bundle = create_bundle(title: "Higashiyama day", created_by: @peter)
    idea = create_idea(title: "Nanzen-ji", created_by: @peter)
    link!(parent: trip, child: bundle)
    link!(parent: bundle, child: idea)

    assert_includes visible_ids(@sarah), idea.id, "the owner sees a nested idea someone else added"
    assert_not_includes visible_ids(@stranger), idea.id
  end

  test "a trip with no membership row is visible to nobody, not even its creator" do
    trip = create_trip(created_by: @sarah)
    TripMembership.where(trip_id: trip.id).delete_all

    assert_not_includes visible_ids(@sarah), trip.id
  end

  test "an archived trip is still visible to its owner" do
    trip = create_trip(title: "Set aside", created_by: @sarah)
    trip.archive!

    assert_includes visible_ids(@sarah), trip.id
    assert_equal "owner", trip.role_for(@sarah)
  end

  test "a library idea is private to its creator" do
    idea = create_idea(title: "Saigon street food crawl", created_by: @sarah)

    assert_includes visible_ids(@sarah), idea.id
    assert_not_includes visible_ids(@peter), idea.id
    assert_equal "owner", idea.role_for(@sarah)
    assert_nil idea.role_for(@peter)
  end

  test "an idea loses its library status once it hangs under someone else's trip" do
    trip = create_trip(title: "Malaysia", created_by: @peter)
    idea = create_idea(title: "Bali", created_by: @sarah)
    link!(parent: trip, child: idea)

    assert_not_includes visible_ids(@sarah), idea.id, "creating it is not access -- the trip decides"
    assert_includes visible_ids(@peter), idea.id
    assert_nil idea.role_for(@sarah)
  end

  test "an idea under two trips resolves to the most permissive role" do
    weak = create_trip(title: "Weak", created_by: @peter)
    strong = create_trip(title: "Strong", created_by: @peter)
    member!(trip: weak, user: @sarah, role: "viewer")
    member!(trip: strong, user: @sarah, role: "member")

    idea = create_idea(title: "Shared", created_by: @peter)
    link!(parent: weak, child: idea)
    link!(parent: strong, child: idea)

    assert_equal "member", idea.role_for(@sarah)
    assert_equal "owner", idea.role_for(@peter)
    assert_nil idea.role_for(@stranger)
  end

  test "role_for reads through a bundle to the trip above it" do
    trip = create_trip(created_by: @peter)
    bundle = create_bundle(created_by: @peter)
    idea = create_idea(created_by: @peter)
    link!(parent: trip, child: bundle)
    link!(parent: bundle, child: idea)
    member!(trip: trip, user: @sarah, role: "viewer")

    assert_equal "viewer", idea.role_for(@sarah)
    assert_equal "viewer", bundle.role_for(@sarah)
  end

  test "an idea in a bundle that hangs under no trip is still its creator's" do
    bundle = create_bundle(created_by: @sarah)
    idea = create_idea(created_by: @sarah)
    link!(parent: bundle, child: idea)

    assert_includes visible_ids(@sarah), idea.id
    assert_equal "owner", idea.role_for(@sarah)
  end

  test "visible_to composes with the other scopes" do
    live = create_trip(title: "Live", created_by: @sarah)
    archived = create_trip(title: "Archived", created_by: @sarah)
    archived.archive!

    ids = Entry.visible_to(@sarah).active.trip.pluck(:id)
    assert_includes ids, live.id
    assert_not_includes ids, archived.id
  end

  # The seed data is the demo, and it is the one place the whole shape exists at
  # once. Asserted by property, never by a pasted row count -- a literal would
  # break the build the next time someone adds an idea.
  test "the seeded world is split the way the demo needs" do
    capture_io { load Rails.root.join("db/seeds.rb") }

    sarah = User.find_by!(email: "sarah@example.com")
    peter = User.find_by!(email: "peter@example.com")
    japan = Entry.find_by!(kind: "trip", title: "Japan")
    malaysia = Entry.find_by!(kind: "trip", title: "Malaysia")
    saigon = Entry.find_by!(title: "Saigon street food crawl")

    sarah_sees = Entry.visible_to(sarah).pluck(:id)
    peter_sees = Entry.visible_to(peter).pluck(:id)
    japan_subtree = Entry.descendant_ids_of(japan.id).map(&:to_i)

    assert_operator japan_subtree.size, :>, 0
    assert_includes sarah_sees, japan.id
    assert_empty japan_subtree - sarah_sees, "Sarah owns Japan, so she sees all of it"
    assert_equal "owner", japan.role_for(sarah)

    # Peter wrote five of Japan's ideas and votes on eight of its entries, so the
    # two-voice vote demo needs him to reach the whole trip.
    assert_empty ([ japan.id ] + japan_subtree) - peter_sees
    assert_equal "member", japan.role_for(peter)

    # The seeded read-only case: Sarah reads Malaysia and changes nothing.
    assert_includes sarah_sees, malaysia.id
    assert_equal "viewer", malaysia.role_for(sarah)
    assert_equal "owner", malaysia.role_for(peter)

    # The library stays private even between the two seeded accounts.
    assert_includes sarah_sees, saigon.id
    assert_not_includes peter_sees, saigon.id

    assert_empty visible_ids(@stranger), "a stranger to both trips sees nothing at all"
  end
end
