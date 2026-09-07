require "test_helper"

# The new authority in the product: "delete for good" is the first verb that
# authorship can grant, so this is the part most worth pinning down. Everything
# else EntryPolicy does is exercised through the request tests; these are here
# because the answer depends on three things at once (kind, membership role and
# who wrote it) and no single request test can hold all the combinations.
class EntryPolicyTest < ActiveSupport::TestCase
  setup do
    @owner = create_user(name: "Owner")
    @member = create_user(name: "Member")
    @trip = create_trip(title: "Japan, spring", created_by: @owner)
    member!(trip: @trip, user: @member)
  end

  def may_destroy?(user, entry) = EntryPolicy.new(user, entry).destroy_permanently?

  test "a trip answers to its owner alone" do
    assert may_destroy?(@owner, @trip)
    assert_not may_destroy?(@member, @trip)
  end

  # The one place authorship is deliberately NOT a fallback: trip access has
  # exactly one authority, a membership row. A member who made the trip and then
  # handed it over has no destroy verb on it any more.
  test "a member who created a trip still may not destroy it once it is not theirs" do
    theirs = create_trip(title: "Handed over", created_by: @member)
    TripMembership.find_by(trip_id: theirs.id, user_id: @member.id).update!(role: "member")
    TripMembership.create!(trip: theirs, user: @owner, role: "owner")

    assert_not may_destroy?(@member, theirs)
    assert may_destroy?(@owner, theirs)
  end

  test "a member may destroy an idea they created inside someone else's trip" do
    mine = create_idea(title: "Ramen Ichiran", created_by: @member)
    link!(parent: @trip, child: mine)

    assert may_destroy?(@member, mine)
  end

  test "a member may not destroy an idea a co-traveller created" do
    theirs = create_idea(title: "Not mine", created_by: @owner)
    link!(parent: @trip, child: theirs)

    assert_not may_destroy?(@member, theirs)
    # The trip's owner still may -- ownership is the other branch.
    assert may_destroy?(@owner, theirs)
  end

  # The `write?` floor. Authorship alone is not enough: someone demoted to viewer
  # has been told they may no longer change this trip, and a destroy verb left
  # over on their old work would say otherwise.
  test "a viewer who created an idea before being demoted may not destroy it" do
    mine = create_idea(title: "Written while a member", created_by: @member)
    link!(parent: @trip, child: mine)
    TripMembership.find_by(trip_id: @trip.id, user_id: @member.id).update!(role: "viewer")

    assert_not may_destroy?(@member, mine)
  end

  # Nothing new is needed for the library: role_for already hands "owner" to the
  # creator of an entry that hangs under no trip, so manage? alone covers it.
  test "a library entry's creator may destroy it, and nobody else can even see it" do
    mine = create_idea(title: "Kept, not yet in a trip", created_by: @member)

    assert may_destroy?(@member, mine)
    assert_not may_destroy?(@owner, mine)
    assert_not EntryPolicy.new(@owner, mine).read?
  end

  test "a stranger to the trip may destroy nothing in it" do
    stranger = create_user(name: "Stranger")
    idea = create_idea(created_by: @owner)
    link!(parent: @trip, child: idea)

    assert_not may_destroy?(stranger, @trip)
    assert_not may_destroy?(stranger, idea)
  end
end
