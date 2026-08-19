require "test_helper"

class Api::EntriesTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
  end

  test "requires authentication" do
    delete "/api/session"
    get "/api/entries"
    assert_response :unauthorized
  end

  test "requires access to the trip, not merely a session" do
    theirs = create_trip(title: "Not yours", created_by: create_user)

    get "/api/entries/#{theirs.id}"
    assert_response :not_found

    get "/api/entries"
    assert_response :success
    assert_not_includes JSON.parse(response.body)["entries"].map { |e| e["id"] }, theirs.id
  end

  test "GET /api/entries returns list-form entries with computed fields" do
    idea = create_idea(created_by: @user)
    Vote.create!(entry: idea, user: @user, score: 2)
    other = create_user(name: "Other Voter")
    Vote.create!(entry: idea, user: other, score: -1)
    Todo.create!(title: "Book", entry: idea)

    get "/api/entries"
    assert_response :success
    body = JSON.parse(response.body)
    row = body["entries"].find { |e| e["id"] == idea.id }

    assert_equal idea.title, row["title"]
    assert_equal({
      "total" => 1, "count" => 2, "average" => 0.5,
      # Named, in user_id order, so the list can show who is behind the score.
      "voters" => [
        { "user_id" => @user.id, "user_name" => @user.name, "score" => 2 },
        { "user_id" => other.id, "user_name" => other.name, "score" => -1 }
      ]
    }, row["vote_tally"])
    assert_equal 2, row["my_vote"]
    assert_equal 1, row["todos_open_count"]
    assert_equal 0, row["children_count"]
    assert_equal false, row["scheduled"]
  end

  test "GET /api/entries list endpoint does not N+1 per entry" do
    trip = create_trip(created_by: @user)
    20.times do |i|
      idea = create_idea(title: "Idea #{i}", created_by: @user)
      link!(parent: trip, child: idea)
      Vote.create!(entry: idea, user: @user, score: 1)
      Todo.create!(title: "todo #{i}", entry: idea)
    end

    query_count = count_queries { get "/api/entries", params: { trip_id: trip.id } }
    assert_response :success
    assert_equal 20, JSON.parse(response.body)["entries"].size
    # Bounded regardless of row count: base scope + kind/category filters +
    # descendant lookup + 4 bulk aggregate queries + a small constant, not
    # anything that scales with the 20 entries returned.
    assert query_count < 15, "expected a bounded query count, got #{query_count}"
  end

  # The no-trip_id path is the one that gains the visibility CTE. It is an IN
  # subquery rather than a pluck, so it rides along on the base scope's single
  # SELECT and costs no extra round trip: same budget as the trip_id path above.
  test "GET /api/entries with no trip_id stays inside the same query budget" do
    trip = create_trip(created_by: @user)
    20.times do |i|
      idea = create_idea(title: "Idea #{i}", created_by: @user)
      link!(parent: trip, child: idea)
      Vote.create!(entry: idea, user: @user, score: 1)
      Todo.create!(title: "todo #{i}", entry: idea)
    end

    query_count = count_queries { get "/api/entries" }
    assert_response :success
    assert query_count < 15, "expected a bounded query count, got #{query_count}"
  end

  test "GET /api/entries filters by kind, category, q, and unassigned" do
    trip = create_trip(title: "Japan", created_by: @user)
    food = create_idea(title: "Ramen", category: "food", created_by: @user)
    link!(parent: trip, child: food)
    orphan = create_idea(title: "Loose idea", category: "place", created_by: @user)

    get "/api/entries", params: { kind: "trip" }
    ids = JSON.parse(response.body)["entries"].map { |e| e["id"] }
    assert_includes ids, trip.id
    assert_not_includes ids, food.id

    get "/api/entries", params: { category: "food" }
    ids = JSON.parse(response.body)["entries"].map { |e| e["id"] }
    assert_equal [food.id], ids

    get "/api/entries", params: { q: "Ramen" }
    ids = JSON.parse(response.body)["entries"].map { |e| e["id"] }
    assert_equal [food.id], ids

    get "/api/entries", params: { unassigned: "true" }
    ids = JSON.parse(response.body)["entries"].map { |e| e["id"] }
    assert_includes ids, orphan.id
    assert_not_includes ids, food.id
  end

  test "GET /api/entries hides archived unless include_archived=true" do
    idea = create_idea(created_by: @user)
    idea.archive!

    get "/api/entries"
    assert_not_includes JSON.parse(response.body)["entries"].map { |e| e["id"] }, idea.id

    get "/api/entries", params: { include_archived: "true" }
    assert_includes JSON.parse(response.body)["entries"].map { |e| e["id"] }, idea.id
  end

  test "POST /api/entries creates an entry, optionally linked under a parent" do
    trip = create_trip(created_by: @user)
    post "/api/entries", params: { entry: { kind: "idea", title: "Nanzen-ji", category: "place" }, parent_id: trip.id }, as: :json
    assert_response :created
    body = JSON.parse(response.body)
    entry_id = body.dig("entry", "id")
    assert_equal "Nanzen-ji", body.dig("entry", "title")
    # kind is create-only in entry_params, so create is the one place it must land.
    assert_equal "idea", body.dig("entry", "kind")
    assert EntryLink.exists?(parent_id: trip.id, child_id: entry_id)
  end

  test "GET /api/entries/:id returns entry, parents, children, votes, todos" do
    trip = create_trip(created_by: @user)
    idea = create_idea(created_by: @user)
    link!(parent: trip, child: idea)
    Vote.create!(entry: idea, user: @user, score: 1)
    Todo.create!(title: "Book", entry: idea)

    get "/api/entries/#{idea.id}"
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal idea.id, body.dig("entry", "id")
    assert_equal [trip.id], body["parents"].map { |p| p["id"] }
    assert_equal [], body["children"]
    assert_equal 1, body["votes"].size
    assert_equal 1, body["todos"].size
  end

  test "PATCH /api/entries/:id updates attributes" do
    idea = create_idea(created_by: @user)
    patch "/api/entries/#{idea.id}", params: { entry: { title: "New title" } }, as: :json
    assert_response :success
    assert_equal "New title", JSON.parse(response.body).dig("entry", "title")
  end

  # The hostile insider: someone who already holds write access smuggling a kind
  # change into an otherwise ordinary update. kind is create-only because the
  # transitions belong to lift/absorb -- a PATCH that demoted a trip would fire
  # sync_owner_membership and silently wipe every membership, the owner's included.
  test "PATCH /api/entries/:id ignores kind from a non-owner member and keeps memberships" do
    owner = create_user
    trip = create_trip(created_by: owner)
    member!(trip: trip, user: @user, role: "member")
    memberships_before = TripMembership.where(trip_id: trip.id).order(:id).pluck(:user_id, :role)

    patch "/api/entries/#{trip.id}", params: { entry: { kind: "idea", title: "Still a trip" } }, as: :json
    assert_response :success
    assert_equal "trip", trip.reload.kind
    assert_equal "Still a trip", trip.title
    assert_equal memberships_before, TripMembership.where(trip_id: trip.id).order(:id).pluck(:user_id, :role)
  end

  test "PATCH /api/entries/:id ignores kind even from the owner" do
    trip = create_trip(created_by: @user)
    memberships_before = TripMembership.where(trip_id: trip.id).order(:id).pluck(:user_id, :role)

    patch "/api/entries/#{trip.id}", params: { entry: { kind: "idea", title: "Renamed" } }, as: :json
    assert_response :success
    assert_equal "trip", trip.reload.kind
    assert_equal "Renamed", trip.title
    assert_equal memberships_before, TripMembership.where(trip_id: trip.id).order(:id).pluck(:user_id, :role)
  end

  # The reverse smuggle: promoting an idea to a trip via PATCH would be a lift
  # that skipped the parent-detachment and ownership handover lift performs.
  test "PATCH /api/entries/:id cannot promote an idea to a trip" do
    idea = create_idea(created_by: @user)

    patch "/api/entries/#{idea.id}", params: { entry: { kind: "trip", title: "Not a lift" } }, as: :json
    assert_response :success
    assert_equal "idea", idea.reload.kind
    assert_equal "Not a lift", idea.title
    assert_equal 0, TripMembership.where(trip_id: idea.id).count
  end

  test "PATCH /api/entries/:id replaces the whole pros and cons arrays" do
    trip = create_trip(created_by: @user)
    pros = [{ "id" => "p1", "text" => "Flights are already booked" }, { "id" => "p2", "text" => "Cheap in May" }]
    cons = [{ "id" => "c1", "text" => "Rainy season" }]

    patch "/api/entries/#{trip.id}", params: { entry: { pros: pros, cons: cons } }, as: :json
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal pros, body.dig("entry", "pros")
    assert_equal cons, body.dig("entry", "cons")
    assert_equal pros, trip.reload.pros

    # The array is carried whole, so a shorter one is a removal.
    patch "/api/entries/#{trip.id}", params: { entry: { pros: [pros.first] } }, as: :json
    assert_response :success
    assert_equal [pros.first], JSON.parse(response.body).dig("entry", "pros")
    assert_equal [pros.first], trip.reload.pros
    assert_equal cons, trip.cons # untouched by an update that omits it
  end

  test "PATCH /api/entries/:id pros and cons work on an idea, not just a trip" do
    idea = create_idea(created_by: @user)
    pros = [{ "id" => "p1", "text" => "Walking distance from the hotel" }]
    cons = [{ "id" => "c1", "text" => "Closed on Mondays" }]

    patch "/api/entries/#{idea.id}", params: { entry: { pros: pros, cons: cons } }, as: :json
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal pros, body.dig("entry", "pros")
    assert_equal cons, body.dig("entry", "cons")
    assert_equal cons, idea.reload.cons
  end

  test "PATCH /api/entries/:id drops unpermitted keys and unusable pro/con items" do
    idea = create_idea(created_by: @user)
    patch "/api/entries/#{idea.id}", params: { entry: { pros: [
      { "id" => "p1", "text" => "  Keep me  ", "score" => 99 },
      { "id" => "p2", "text" => "  " },
      { "text" => "no id" }
    ] } }, as: :json

    assert_response :success
    assert_equal [{ "id" => "p1", "text" => "Keep me" }], JSON.parse(response.body).dig("entry", "pros")
  end

  test "GET /api/entries and /api/entries/:id always include pros and cons" do
    idea = create_idea(created_by: @user)
    idea.update!(cons: [{ "id" => "c1", "text" => "Rainy season" }])
    bare = create_idea(title: "No reasons yet", created_by: @user)

    get "/api/entries"
    assert_response :success
    rows = JSON.parse(response.body)["entries"]
    row = rows.find { |e| e["id"] == idea.id }
    assert_equal [], row["pros"]
    assert_equal [{ "id" => "c1", "text" => "Rainy season" }], row["cons"]

    bare_row = rows.find { |e| e["id"] == bare.id }
    assert_equal [], bare_row["pros"]
    assert_equal [], bare_row["cons"]

    get "/api/entries/#{idea.id}"
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal [], body.dig("entry", "pros")
    assert_equal [{ "id" => "c1", "text" => "Rainy season" }], body.dig("entry", "cons")
  end

  test "POST /api/entries accepts pros and cons at creation" do
    post "/api/entries", params: { entry: {
      kind: "idea", title: "Nanzen-ji", category: "place",
      pros: [{ "id" => "p1", "text" => "Quiet in the morning" }]
    } }, as: :json

    assert_response :created
    body = JSON.parse(response.body)
    assert_equal [{ "id" => "p1", "text" => "Quiet in the morning" }], body.dig("entry", "pros")
    assert_equal [], body.dig("entry", "cons")
  end

  test "DELETE /api/entries/:id soft-archives, never destroys" do
    idea = create_idea(created_by: @user)
    delete "/api/entries/#{idea.id}"
    assert_response :success
    assert Entry.unscoped.exists?(idea.id)
    assert idea.reload.archived_at.present?
  end

  test "POST /api/entries/:id/restore clears archived_at" do
    idea = create_idea(created_by: @user)
    idea.archive!
    post "/api/entries/#{idea.id}/restore"
    assert_response :success
    assert_nil idea.reload.archived_at
  end

  test "GET /api/entries/:id/tree returns descendants" do
    trip = create_trip(created_by: @user)
    child = create_idea(created_by: @user)
    link!(parent: trip, child: child)

    get "/api/entries/#{trip.id}/tree", params: { depth: 3 }
    assert_response :success
    body = JSON.parse(response.body)
    assert_includes body["descendants"].map { |e| e["id"] }, child.id
  end

  test "GET /api/entries/:id/graph returns nodes and edges, edges in position order" do
    trip = create_trip(created_by: @user)
    # Created in id order but linked in the opposite position order, so a result
    # sorted by id would fail the links assertion below.
    second = create_idea(title: "Second by position", created_by: @user)
    first = create_idea(title: "First by position", created_by: @user)
    link!(parent: trip, child: second, position: 1)
    link!(parent: trip, child: first, position: 0)

    get "/api/entries/#{trip.id}/graph"
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal trip.id, body.dig("entry", "id")
    assert_equal [first.id, second.id].sort, body["entries"].map { |e| e["id"] }.sort
    # List form, not summaries: the board needs the computed fields.
    assert body["entries"].all? { |e| e.key?("vote_tally") && e.key?("children_count") && e.key?("scheduled") }
    assert_equal [
      { "parent_id" => trip.id, "child_id" => first.id, "position" => 0 },
      { "parent_id" => trip.id, "child_id" => second.id, "position" => 1 }
    ], body["links"]
  end

  test "GET /api/entries/:id/graph caps the walk at depth" do
    trip = create_trip(created_by: @user)
    child = create_idea(title: "Child", created_by: @user)
    grandchild = create_idea(title: "Grandchild", created_by: @user)
    link!(parent: trip, child: child)
    link!(parent: child, child: grandchild)

    get "/api/entries/#{trip.id}/graph", params: { depth: 1 }
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal [child.id], body["entries"].map { |e| e["id"] }
    # The child->grandchild edge would name a node outside the walk, so it is
    # out along with the node.
    assert_equal [{ "parent_id" => trip.id, "child_id" => child.id, "position" => 0 }], body["links"]
  end

  test "GET /api/entries/:id/graph returns a diamond as two links and one entries row" do
    trip = create_trip(created_by: @user)
    left = create_idea(title: "Left", created_by: @user)
    right = create_idea(title: "Right", created_by: @user)
    shared = create_idea(title: "Shared child", created_by: @user)
    link!(parent: trip, child: left, position: 0)
    link!(parent: trip, child: right, position: 1)
    link!(parent: left, child: shared)
    link!(parent: right, child: shared)

    get "/api/entries/#{trip.id}/graph"
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal 1, body["entries"].count { |e| e["id"] == shared.id }
    assert_equal [left.id, right.id], body["links"].select { |l| l["child_id"] == shared.id }.map { |l| l["parent_id"] }.sort
  end

  # A stranger's entry hung under one of mine: descendant_ids_of walks through
  # it, but policy_scope does not let me see it -- so it must vanish from the
  # node list AND from the edge list, or the link itself would leak its id.
  test "GET /api/entries/:id/graph omits invisible entries from both entries and links" do
    mine = create_idea(title: "My library idea", created_by: @user)
    visible_child = create_idea(title: "Visible child", created_by: @user)
    link!(parent: mine, child: visible_child, position: 0)

    stranger = create_user
    private_entry = create_idea(title: "Private", created_by: stranger)
    link!(parent: mine, child: private_entry, position: 1)

    get "/api/entries/#{mine.id}/graph"
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal [visible_child.id], body["entries"].map { |e| e["id"] }
    assert_not_includes body["links"].flat_map { |l| [l["parent_id"], l["child_id"]] }, private_entry.id
    assert_equal [{ "parent_id" => mine.id, "child_id" => visible_child.id, "position" => 0 }], body["links"]
  end

  test "GET /api/entries/:id/graph requires authentication" do
    trip = create_trip(created_by: @user)
    delete "/api/session"
    get "/api/entries/#{trip.id}/graph"
    assert_response :unauthorized
  end

  test "GET /api/entries/:id/graph on an invisible root is a 404" do
    theirs = create_trip(title: "Not yours", created_by: create_user)
    get "/api/entries/#{theirs.id}/graph"
    assert_response :not_found
  end

  test "GET /api/entries/:id/graph scopes the scheduled flag to trip_id" do
    trip = create_trip(created_by: @user)
    other_trip = create_trip(title: "Other trip", created_by: @user)
    idea = create_idea(created_by: @user)
    link!(parent: trip, child: idea)
    ScheduleItem.create!(trip: trip, entry: idea, day: Date.current)

    get "/api/entries/#{trip.id}/graph", params: { trip_id: trip.id }
    assert_response :success
    row = JSON.parse(response.body)["entries"].find { |e| e["id"] == idea.id }
    assert_equal true, row["scheduled"]

    get "/api/entries/#{trip.id}/graph", params: { trip_id: other_trip.id }
    assert_response :success
    row = JSON.parse(response.body)["entries"].find { |e| e["id"] == idea.id }
    assert_equal false, row["scheduled"]
  end

  test "GET /api/entries with parent_id returns children in link position order" do
    trip = create_trip(created_by: @user)
    # id order a < b < c, position order reversed -- id ordering would fail this.
    a = create_idea(title: "A", created_by: @user)
    b = create_idea(title: "B", created_by: @user)
    c = create_idea(title: "C", created_by: @user)
    link!(parent: trip, child: a, position: 2)
    link!(parent: trip, child: b, position: 1)
    link!(parent: trip, child: c, position: 0)

    get "/api/entries", params: { parent_id: trip.id }
    assert_response :success
    assert_equal [c.id, b.id, a.id], JSON.parse(response.body)["entries"].map { |e| e["id"] }
  end

  test "POST /api/entries/:id/lift converts an idea into a trip and detaches parents" do
    trip = create_trip(created_by: @user)
    idea = create_idea(created_by: @user)
    link!(parent: trip, child: idea)
    child_of_idea = create_idea(title: "grandchild", created_by: @user)
    link!(parent: idea, child: child_of_idea)

    post "/api/entries/#{idea.id}/lift"
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal "trip", body.dig("entry", "kind")
    assert_equal 0, idea.reload.parent_links.count
    assert_equal [child_of_idea.id], idea.child_links.pluck(:child_id)
  end

  test "POST /api/entries/:id/lift makes the lifter the new trip's owner" do
    owner = create_user
    trip = create_trip(created_by: owner)
    idea = create_idea(created_by: owner)
    link!(parent: trip, child: idea)
    member!(trip: trip, user: @user, role: "member")

    post "/api/entries/#{idea.id}/lift"
    assert_response :success
    assert_equal @user.id, idea.reload.created_by_id
    assert_equal "owner", idea.role_for(@user)
  end

  test "POST /api/entries/:id/absorb needs owner on both trips" do
    mine = create_trip(title: "Mine", created_by: @user)
    theirs = create_trip(title: "Theirs", created_by: create_user)

    post "/api/entries/#{mine.id}/absorb", params: { into_id: theirs.id }, as: :json
    assert_response :not_found
    assert_equal "trip", mine.reload.kind
  end

  test "POST /api/entries/:id/absorb folds one trip into another" do
    trip_a = create_trip(title: "A", created_by: @user)
    trip_b = create_trip(title: "B", created_by: @user)
    grandchild = create_idea(created_by: @user)
    link!(parent: trip_b, child: grandchild)

    post "/api/entries/#{trip_b.id}/absorb", params: { into_id: trip_a.id }, as: :json
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal "idea", body.dig("entry", "kind")
    assert EntryLink.exists?(parent_id: trip_a.id, child_id: trip_b.id)
    assert_equal [grandchild.id], trip_b.reload.child_links.pluck(:child_id)
  end

  test "POST /api/entries/:id/fork shallow-duplicates a bundle" do
    bundle = create_bundle(title: "Dinner options", created_by: @user)
    option_a = create_idea(title: "Ramen", created_by: @user)
    option_b = create_idea(title: "Sushi", created_by: @user)
    link!(parent: bundle, child: option_a)
    link!(parent: bundle, child: option_b)

    post "/api/entries/#{bundle.id}/fork"
    assert_response :created
    body = JSON.parse(response.body)
    forked_id = body.dig("entry", "id")
    assert_not_equal bundle.id, forked_id

    forked = Entry.find(forked_id)
    assert_equal [option_a.id, option_b.id].sort, forked.child_links.pluck(:child_id).sort
    # original untouched
    assert_equal [option_a.id, option_b.id].sort, bundle.reload.child_links.pluck(:child_id).sort
  end
end
