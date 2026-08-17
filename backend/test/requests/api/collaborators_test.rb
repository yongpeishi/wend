require "test_helper"

class Api::CollaboratorsTest < ActionDispatch::IntegrationTest
  OWNER_IS_STUCK = "You started this trip, so it needs you until someone else takes it on.".freeze

  setup do
    @owner = create_user(name: "Peter", email: "peter@example.com")
    @sarah = create_user(name: "Sarah", email: "sarah@example.com")
    @reader = create_user(name: "Rae", email: "rae@example.com")
    sign_in_as(@owner)

    @trip = create_trip(title: "Japan", created_by: @owner)
    member!(trip: @trip, user: @sarah, role: "member")
    member!(trip: @trip, user: @reader, role: "viewer")
  end

  def body = JSON.parse(response.body)

  def collaborator_for(user_id)
    body["collaborators"].find { |c| c["user_id"] == user_id }
  end

  test "requires authentication" do
    delete "/api/session"
    get "/api/trips/#{@trip.id}/collaborators"
    assert_response :unauthorized
  end

  # --- GET -------------------------------------------------------------------

  test "GET lists everyone on the trip with the caller's own role" do
    get "/api/trips/#{@trip.id}/collaborators"
    assert_response :success

    assert_equal "owner", body["my_role"]
    assert_equal 3, body["collaborators"].size

    mine = collaborator_for(@owner.id)
    assert_equal "Peter", mine["name"]
    assert_equal "peter@example.com", mine["email"]
    assert_equal "owner", mine["role"]
    assert_equal true, mine["is_you"]
    assert_equal @trip.trip_memberships.find_by(user_id: @owner.id).created_at.iso8601, mine["added_at"]

    theirs = collaborator_for(@sarah.id)
    assert_equal "member", theirs["role"]
    assert_equal false, theirs["is_you"]
  end

  test "GET shows email to a member and hides it from a viewer" do
    sign_in_as(@sarah)
    get "/api/trips/#{@trip.id}/collaborators"
    assert_response :success
    assert_equal "member", body["my_role"]
    assert_equal "peter@example.com", collaborator_for(@owner.id)["email"]

    sign_in_as(@reader)
    get "/api/trips/#{@trip.id}/collaborators"
    assert_response :success
    assert_equal "viewer", body["my_role"]
    # Nobody's, including their own: a shared trip is not an address book.
    assert_equal [ nil, nil, nil ], body["collaborators"].map { |c| c["email"] }
    assert_equal %w[Peter Sarah Rae].sort, body["collaborators"].map { |c| c["name"] }.sort
  end

  test "a trip the caller is not on is 404 and never 403" do
    theirs = create_trip(title: "Not yours", created_by: create_user)

    get "/api/trips/#{theirs.id}/collaborators"
    assert_response :not_found
    assert_not_includes response.body, "Not yours"
  end

  test "a stranger gets 404 on every collaborators route" do
    sign_in_as(create_user)

    get "/api/trips/#{@trip.id}/collaborators"
    assert_response :not_found

    post "/api/trips/#{@trip.id}/collaborators", params: { email: "sarah@example.com", role: "member" }, as: :json
    assert_response :not_found

    patch "/api/trips/#{@trip.id}/collaborators/#{@sarah.id}", params: { role: "viewer" }, as: :json
    assert_response :not_found

    delete "/api/trips/#{@trip.id}/collaborators/#{@sarah.id}"
    assert_response :not_found

    post "/api/trips/#{@trip.id}/collaborators/#{@sarah.id}/hand_over"
    assert_response :not_found

    assert_equal "member", @trip.trip_memberships.find_by(user_id: @sarah.id).role
  end

  test "an entry that is not a trip has no collaborators to ask about" do
    idea = create_idea(created_by: @owner)
    link!(parent: @trip, child: idea)

    get "/api/trips/#{idea.id}/collaborators"
    assert_response :not_found
  end

  # --- POST: the ambiguity requirement ---------------------------------------

  test "POST answers identically whether or not the address belongs to anybody" do
    newcomer = create_user(name: "Nadia", email: "nadia@example.com")

    post "/api/trips/#{@trip.id}/collaborators", params: { email: newcomer.email, role: "member" }, as: :json
    matched_status = response.status
    matched_body = response.body

    post "/api/trips/#{@trip.id}/collaborators", params: { email: "nobody@nowhere.test", role: "member" }, as: :json
    unmatched_status = response.status
    unmatched_body = response.body

    assert_equal 202, matched_status
    assert_equal matched_status, unmatched_status
    assert_equal matched_body, unmatched_body
    assert_equal '{"status":"accepted"}', matched_body

    # ...and the one that matched really did do something.
    assert_equal "member", @trip.trip_memberships.find_by(user_id: newcomer.id)&.role
  end

  test "POST answers the same for your own address and for someone already here" do
    expected = '{"status":"accepted"}'

    post "/api/trips/#{@trip.id}/collaborators", params: { email: @owner.email, role: "member" }, as: :json
    assert_response :accepted
    assert_equal expected, response.body

    post "/api/trips/#{@trip.id}/collaborators", params: { email: @reader.email, role: "member" }, as: :json
    assert_response :accepted
    assert_equal expected, response.body

    assert_equal "owner", @trip.trip_memberships.find_by(user_id: @owner.id).role
    # Already here is a no-op, not a promotion: role changes go through PATCH.
    assert_equal "viewer", @trip.trip_memberships.find_by(user_id: @reader.id).role
    assert_equal 3, @trip.trip_memberships.count
  end

  test "POST normalizes the address before looking for it" do
    newcomer = create_user(name: "Nadia", email: "nadia@example.com")

    post "/api/trips/#{@trip.id}/collaborators", params: { email: "  Nadia@Example.com  ", role: "viewer" }, as: :json
    assert_response :accepted
    assert_equal "viewer", @trip.trip_memberships.find_by(user_id: newcomer.id)&.role
  end

  test "POST rejects a blank or malformed address, and a role that is not grantable" do
    post "/api/trips/#{@trip.id}/collaborators", params: { email: "   ", role: "member" }, as: :json
    assert_response :unprocessable_entity
    assert_equal [ "can't be blank" ], body.dig("errors", "email")

    post "/api/trips/#{@trip.id}/collaborators", params: { email: "not-an-address", role: "member" }, as: :json
    assert_response :unprocessable_entity
    assert_equal [ "is not an email address" ], body.dig("errors", "email")

    post "/api/trips/#{@trip.id}/collaborators", params: { email: "sarah@example.com" }, as: :json
    assert_response :unprocessable_entity
    assert_equal [ "can't be blank" ], body.dig("errors", "role")
  end

  test "POST refuses to mint a second owner" do
    newcomer = create_user(email: "nadia@example.com")

    post "/api/trips/#{@trip.id}/collaborators", params: { email: newcomer.email, role: "owner" }, as: :json
    assert_response :unprocessable_entity
    assert_equal [ "must be member or viewer" ], body.dig("errors", "role")
    assert_nil @trip.trip_memberships.find_by(user_id: newcomer.id)
  end

  test "a member may bring someone along and a viewer may not" do
    newcomer = create_user(email: "nadia@example.com")

    sign_in_as(@sarah)
    post "/api/trips/#{@trip.id}/collaborators", params: { email: newcomer.email, role: "viewer" }, as: :json
    assert_response :accepted

    sign_in_as(@reader)
    post "/api/trips/#{@trip.id}/collaborators", params: { email: "someone-else@example.com", role: "viewer" }, as: :json
    assert_response :forbidden
    assert_equal "You can read this trip, but not bring people onto it.", body["error"]
  end

  # --- PATCH -----------------------------------------------------------------

  test "PATCH changes what someone may do and answers with that one collaborator" do
    patch "/api/trips/#{@trip.id}/collaborators/#{@sarah.id}", params: { role: "viewer" }, as: :json
    assert_response :success

    assert_equal "viewer", body.dig("collaborator", "role")
    assert_equal @sarah.id, body.dig("collaborator", "user_id")
    assert_equal "sarah@example.com", body.dig("collaborator", "email")
    assert_equal "viewer", @trip.trip_memberships.find_by(user_id: @sarah.id).role
  end

  test "PATCH refuses owner, because hand_over is the only way the owner moves" do
    patch "/api/trips/#{@trip.id}/collaborators/#{@sarah.id}", params: { role: "owner" }, as: :json
    assert_response :unprocessable_entity
    assert_equal [ "must be member or viewer" ], body.dig("errors", "role")
    assert_equal "member", @trip.trip_memberships.find_by(user_id: @sarah.id).role
  end

  test "PATCH is the owner's alone" do
    sign_in_as(@sarah)
    patch "/api/trips/#{@trip.id}/collaborators/#{@reader.id}", params: { role: "member" }, as: :json
    assert_response :forbidden
    assert_equal "Only the person who started this trip can change what people can do.", body["error"]
    assert_equal "viewer", @trip.trip_memberships.find_by(user_id: @reader.id).role
  end

  test "PATCH cannot demote the owner" do
    patch "/api/trips/#{@trip.id}/collaborators/#{@owner.id}", params: { role: "member" }, as: :json
    assert_response :forbidden
    assert_equal OWNER_IS_STUCK, body["error"]
    assert_equal "owner", @trip.trip_memberships.find_by(user_id: @owner.id).role
  end

  test "PATCH for somebody who is not on the trip is 404" do
    patch "/api/trips/#{@trip.id}/collaborators/#{create_user.id}", params: { role: "viewer" }, as: :json
    assert_response :not_found
  end

  # --- DELETE ----------------------------------------------------------------

  test "the owner may take anyone off" do
    delete "/api/trips/#{@trip.id}/collaborators/#{@sarah.id}"
    assert_response :no_content
    assert_equal "", response.body
    assert_nil @trip.trip_memberships.find_by(user_id: @sarah.id)
  end

  test "anyone else may leave, but may not take somebody else off" do
    sign_in_as(@sarah)

    delete "/api/trips/#{@trip.id}/collaborators/#{@reader.id}"
    assert_response :forbidden
    assert_equal "Only the person who started this trip can take someone off it.", body["error"]

    delete "/api/trips/#{@trip.id}/collaborators/#{@sarah.id}"
    assert_response :no_content
    assert_nil @trip.trip_memberships.find_by(user_id: @sarah.id)
    # And the trip is gone from their world entirely.
    get "/api/trips/#{@trip.id}/collaborators"
    assert_response :not_found
  end

  test "the owner cannot be removed, including by themselves" do
    delete "/api/trips/#{@trip.id}/collaborators/#{@owner.id}"
    assert_response :forbidden
    assert_equal OWNER_IS_STUCK, body["error"]
    assert_equal "owner", @trip.trip_memberships.find_by(user_id: @owner.id).role

    sign_in_as(@sarah)
    delete "/api/trips/#{@trip.id}/collaborators/#{@owner.id}"
    assert_response :forbidden
    assert_equal OWNER_IS_STUCK, body["error"]
    assert_equal "owner", @trip.trip_memberships.find_by(user_id: @owner.id).role
  end

  # --- hand_over -------------------------------------------------------------

  test "hand_over moves the trip and answers with the fresh list" do
    post "/api/trips/#{@trip.id}/collaborators/#{@sarah.id}/hand_over"
    assert_response :success

    assert_equal "owner", @trip.trip_memberships.find_by(user_id: @sarah.id).role
    assert_equal "member", @trip.trip_memberships.find_by(user_id: @owner.id).role

    # The GET body, so the caller does not have to ask again for a list they can
    # already see has changed under them.
    assert_equal "member", body["my_role"]
    assert_equal "owner", collaborator_for(@sarah.id)["role"]
    assert_equal "member", collaborator_for(@owner.id)["role"]
    assert_equal 3, body["collaborators"].size
  end

  test "hand_over is the owner's alone and cannot be aimed at yourself" do
    post "/api/trips/#{@trip.id}/collaborators/#{@owner.id}/hand_over"
    assert_response :unprocessable_entity
    assert_equal [ "already has this trip" ], body.dig("errors", "user_id")

    sign_in_as(@sarah)
    post "/api/trips/#{@trip.id}/collaborators/#{@reader.id}/hand_over"
    assert_response :forbidden
    assert_equal "Only the person who started this trip can hand it on.", body["error"]
    assert_equal "owner", @trip.trip_memberships.find_by(user_id: @owner.id).role
  end

  # --- Wire format on entries ------------------------------------------------
  # These belong to this slice rather than entries_test.rb: they are the same two
  # fields the endpoints above maintain, seen from the entry payloads.

  test "a trip carries the caller's role in a list, and an idea carries none" do
    idea = create_idea(created_by: @owner)
    link!(parent: @trip, child: idea)

    sign_in_as(@reader)
    get "/api/entries"
    assert_response :success
    rows = body["entries"].index_by { |e| e["id"] }
    assert_equal "viewer", rows[@trip.id]["my_role"]
    assert_nil rows[idea.id]["my_role"]
  end

  test "trip detail counts the people on it" do
    get "/api/entries/#{@trip.id}"
    assert_response :success
    assert_equal 3, body["collaborators_count"]

    idea = create_idea(created_by: @owner)
    link!(parent: @trip, child: idea)
    get "/api/entries/#{idea.id}"
    assert_response :success
    # An idea reports the trip it sits in -- it is the same set of people.
    assert_equal 3, body["collaborators_count"]

    library_idea = create_idea(title: "Someday", created_by: @owner)
    get "/api/entries/#{library_idea.id}"
    assert_response :success
    assert_equal 0, body["collaborators_count"]
  end

  test "detail never names a trip the caller cannot see" do
    other_trip = create_trip(title: "SecretTripToOsaka", created_by: create_user)
    shared_idea = create_idea(title: "Ramen", created_by: @owner)
    link!(parent: @trip, child: shared_idea)
    link!(parent: other_trip, child: shared_idea)

    get "/api/entries/#{shared_idea.id}"
    assert_response :success
    assert_equal [ @trip.id ], body["parents"].map { |p| p["id"] }
    assert_not_includes response.body, "SecretTripToOsaka"
  end

  test "detail never names a child the caller cannot see" do
    stranger = create_user
    mine = create_idea(title: "My shortlist", created_by: @owner)
    theirs = create_idea(title: "SecretIdeaOfTheirs", created_by: stranger)
    link!(parent: mine, child: theirs)

    get "/api/entries/#{mine.id}"
    assert_response :success
    assert_equal [], body["children"]
    assert_not_includes response.body, "SecretIdeaOfTheirs"
  end
end
