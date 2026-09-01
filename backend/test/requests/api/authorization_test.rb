require "test_helper"

# The route-table sweep: one signed-in stranger, every API route, and an assertion
# about the *response* rather than about whether a policy method happened to run.
# A missing authorize call is only a bug if something comes back, and this is what
# notices.
class Api::AuthorizationTest < ActionDispatch::IntegrationTest
  # Distinctive strings rather than ids, so "did any of this leak" is a substring
  # check that cannot pass by coincidence.
  OWNER_TRACES = %w[
    OwnerTripJapan
    OwnerIdeaRamen
    OwnerBundleDinner
    OwnerTodoVisa
    OwnerNoteAboutTheApp
    OwnerLodgingRyokan
    owner-of-everything@example.com
  ].freeze

  setup do
    @owner = create_user(name: "Owner", email: "owner-of-everything@example.com")
    @stranger = create_user(name: "Stranger", email: "stranger@example.com")

    @trip = create_trip(title: "OwnerTripJapan", created_by: @owner)
    @idea = create_idea(title: "OwnerIdeaRamen", created_by: @owner)
    @bundle = create_bundle(title: "OwnerBundleDinner", created_by: @owner)
    link!(parent: @trip, child: @idea, position: 0)
    link!(parent: @trip, child: @bundle, position: 1)
    @todo = Todo.create!(title: "OwnerTodoVisa", trip: @trip)
    @item = ScheduleItem.create!(trip: @trip, entry: @idea, day: "2026-04-01", starts_at_minutes: 540)
    @feedback = Feedback.create!(user: @owner, message: "OwnerNoteAboutTheApp")

    # The owner's itinerary for that date, so the day/version routes have a real
    # row to be turned away from. The lodging label is a trace of its own: if a
    # day ever leaks, it leaks with this attached.
    @trip_day = TripDay.ensure!(trip_id: @trip.id, day: "2026-04-01")
    @trip_day.update!(lodging_label: "OwnerLodgingRyokan")
    @version = @trip_day.first_live_version

    sign_in_as(@stranger)
  end

  test "a signed-in stranger reaches nothing that belongs to someone else" do
    probes.each do |key, (expectation, request)|
      # Fresh session per probe: signing out and signing up are themselves routes on
      # this table, and neither should be able to change what the next probe means.
      sign_in_as(@stranger)
      request.call

      case expectation
      when :denied
        # 404 and not 403. A 403 would confirm the id exists, which makes trip ids
        # enumerable and undoes the whole feature.
        assert_equal 404, response.status, "#{key} answered #{response.status} for a stranger"
      when :forbidden
        # Admin-only routes address no guessable record, so unlike :denied there is
        # nothing a 403 could confirm the existence of -- the honest status is safe.
        assert_equal 403, response.status, "#{key} answered #{response.status} for a non-admin"
      when :empty, :open
        assert response.successful?, "#{key} answered #{response.status}"
      end

      OWNER_TRACES.each do |trace|
        assert_not_includes response.body, trace, "#{key} leaked #{trace} to a stranger"
      end
    end
  end

  test "every API route is probed" do
    routed = Rails.application.routes.routes.filter_map do |route|
      defaults = route.defaults
      "#{defaults[:controller]}##{defaults[:action]}" if defaults[:controller].to_s.start_with?("api/")
    end

    assert_equal routed.uniq.sort, probes.keys.sort,
                 "every API route needs a probe here -- add one for the route you just added"
  end

  # --- The hostile insider ----------------------------------------------------
  #
  # The sweep above probes a stranger addressed at someone else's routes. This is
  # the other half of the class of bug: foreign keys inside writable params must
  # be validated against the caller's trip. The policy layer only ever checks the
  # trip being addressed, so an authenticated member calling a route they
  # legitimately may call -- on their OWN trip -- could otherwise smuggle someone
  # else's ids (entry_id, chosen_entry_id, day_version_id, lodging_entry_id) into
  # the params and read the foreign row back through the serializers, or plant a
  # row inside the foreign trip's itinerary. Each must 422 with no trace of the
  # owner's world in the body.

  test "a member cannot read a foreign entry by scheduling its id into their own trip" do
    mine = create_trip(title: "StrangerTripKyoto")

    post "/api/trips/#{mine.id}/schedule",
         params: { schedule_item: { entry_id: @idea.id, day: "2026-04-01" } }, as: :json

    assert_equal 422, response.status
    assert_not ScheduleItem.exists?(trip_id: mine.id, entry_id: @idea.id)
    OWNER_TRACES.each do |trace|
      assert_not_includes response.body, trace, "schedule create leaked #{trace} to an insider"
    end
  end

  test "a member cannot read a foreign entry through chosen_entry_id either" do
    mine = create_trip(title: "StrangerTripKyoto")
    my_bundle = create_bundle(title: "StrangerBundleDinner")
    link!(parent: mine, child: my_bundle)

    post "/api/trips/#{mine.id}/schedule",
         params: { schedule_item: { entry_id: my_bundle.id, chosen_entry_id: @idea.id, day: "2026-04-01" } },
         as: :json

    assert_equal 422, response.status
    assert_not ScheduleItem.exists?(trip_id: mine.id, chosen_entry_id: @idea.id)
    OWNER_TRACES.each do |trace|
      assert_not_includes response.body, trace, "schedule create leaked #{trace} to an insider"
    end
  end

  test "a member cannot plant a row in another trip's itinerary via day_version_id on create" do
    mine = create_trip(title: "StrangerTripKyoto")
    my_idea = create_idea(title: "StrangerIdeaGion")
    link!(parent: mine, child: my_idea)

    assert_no_difference -> { ScheduleItem.where(day_version_id: @version.id).count } do
      post "/api/trips/#{mine.id}/schedule",
           params: { schedule_item: { entry_id: my_idea.id, day: "2026-04-01", day_version_id: @version.id } },
           as: :json
    end

    assert_equal 422, response.status
    OWNER_TRACES.each do |trace|
      assert_not_includes response.body, trace, "schedule create leaked #{trace} to an insider"
    end
  end

  test "a member cannot repoint their own item at another trip's day version" do
    mine = create_trip(title: "StrangerTripKyoto")
    my_idea = create_idea(title: "StrangerIdeaGion")
    link!(parent: mine, child: my_idea)
    item = ScheduleItem.create!(trip: mine, entry: my_idea, day: "2026-04-01", starts_at_minutes: 540)

    patch "/api/schedule_items/#{item.id}",
          params: { schedule_item: { day_version_id: @version.id } }, as: :json

    assert_equal 422, response.status
    assert_not_equal @version.id, item.reload.day_version_id
    OWNER_TRACES.each do |trace|
      assert_not_includes response.body, trace, "schedule update leaked #{trace} to an insider"
    end
  end

  test "a member cannot read a foreign entry by setting it as their own day's lodging" do
    mine = create_trip(title: "StrangerTripKyoto")

    patch "/api/trips/#{mine.id}/days/2026-04-01",
          params: { trip_day: { lodging_entry_id: @idea.id } }, as: :json

    assert_equal 422, response.status
    assert_nil TripDay.find_by(trip_id: mine.id, day: "2026-04-01")&.lodging_entry_id
    OWNER_TRACES.each do |trace|
      assert_not_includes response.body, trace, "trip_day update leaked #{trace} to an insider"
    end
  end

  private

  # Every route under /api, and what a signed-in stranger is entitled to get back.
  #
  #   :denied -- addressed at something that is not theirs. 404, never 403.
  #   :empty  -- a collection anyone may ask for, which must come back with no trace
  #              of the other person's world in it.
  #   :open   -- deliberately reachable by anyone: signing in and out, asking who you
  #              are, signing up, and saying something about the app itself.
  #   :forbidden -- admin-only. A signed-in non-admin is turned away at the door
  #                 with a flat 403 and no trace of anyone's feedback.
  def probes
    {
      "api/entries#index" => [ :empty, -> { get "/api/entries" } ],
      "api/entries#show" => [ :denied, -> { get "/api/entries/#{@idea.id}" } ],
      "api/entries#create" => [ :denied, lambda {
        post "/api/entries",
             params: { entry: { kind: "idea", title: "Snuck in" }, parent_id: @trip.id }, as: :json
      } ],
      "api/entries#update" => [ :denied, lambda {
        patch "/api/entries/#{@idea.id}", params: { entry: { title: "Renamed" } }, as: :json
      } ],
      "api/entries#destroy" => [ :denied, -> { delete "/api/entries/#{@idea.id}" } ],
      "api/entries#restore" => [ :denied, -> { post "/api/entries/#{@idea.id}/restore" } ],
      "api/entries#tree" => [ :denied, -> { get "/api/entries/#{@trip.id}/tree" } ],
      "api/entries#lift" => [ :denied, -> { post "/api/entries/#{@idea.id}/lift" } ],
      "api/entries#absorb" => [ :denied, lambda {
        post "/api/entries/#{@trip.id}/absorb", params: { into_id: @bundle.id }, as: :json
      } ],
      "api/entries#fork" => [ :denied, -> { post "/api/entries/#{@idea.id}/fork" } ],

      "api/entry_links#create" => [ :denied, lambda {
        post "/api/entries/#{@trip.id}/links", params: { child_id: @idea.id }, as: :json
      } ],
      "api/entry_links#update" => [ :denied, lambda {
        patch "/api/entries/#{@trip.id}/links/#{@idea.id}", params: { position: 3 }, as: :json
      } ],
      "api/entry_links#destroy" => [ :denied, -> { delete "/api/entries/#{@trip.id}/links/#{@idea.id}" } ],
      "api/entry_links#reorder" => [ :denied, lambda {
        post "/api/entries/#{@trip.id}/links/reorder", params: { child_ids: [ @idea.id ] }, as: :json
      } ],

      "api/votes#update" => [ :denied, lambda {
        put "/api/entries/#{@idea.id}/vote", params: { score: 2 }, as: :json
      } ],
      "api/votes#destroy" => [ :denied, -> { delete "/api/entries/#{@idea.id}/vote" } ],

      "api/todos#index" => [ :empty, -> { get "/api/todos", params: { trip_id: @trip.id } } ],
      "api/todos#create" => [ :denied, lambda {
        post "/api/todos", params: { todo: { title: "Snuck in", trip_id: @trip.id } }, as: :json
      } ],
      "api/todos#update" => [ :denied, lambda {
        patch "/api/todos/#{@todo.id}", params: { todo: { title: "Renamed" } }, as: :json
      } ],
      "api/todos#destroy" => [ :denied, -> { delete "/api/todos/#{@todo.id}" } ],

      "api/schedule_items#index" => [ :denied, -> { get "/api/trips/#{@trip.id}/schedule" } ],
      "api/schedule_items#create" => [ :denied, lambda {
        post "/api/trips/#{@trip.id}/schedule",
             params: { schedule_item: { entry_id: @idea.id, day: "2026-04-02" } }, as: :json
      } ],
      "api/schedule_items#update" => [ :denied, lambda {
        patch "/api/schedule_items/#{@item.id}", params: { schedule_item: { starts_at_minutes: 600 } }, as: :json
      } ],
      "api/schedule_items#destroy" => [ :denied, -> { delete "/api/schedule_items/#{@item.id}" } ],

      "api/itineraries#index" => [ :denied, -> { get "/api/trips/#{@trip.id}/itinerary" } ],
      "api/itineraries#swap_days" => [ :denied, lambda {
        post "/api/trips/#{@trip.id}/itinerary/swap_days",
             params: { a: "2026-04-01", b: "2026-04-02" }, as: :json
      } ],

      "api/trip_days#update" => [ :denied, lambda {
        patch "/api/trips/#{@trip.id}/days/2026-04-01",
              params: { trip_day: { lodging_label: "Snuck in" } }, as: :json
      } ],

      "api/day_versions#create" => [ :denied, -> { post "/api/trips/#{@trip.id}/days/2026-04-01/versions" } ],
      "api/day_versions#keep" => [ :denied, -> { post "/api/day_versions/#{@version.id}/keep" } ],
      "api/day_versions#restore" => [ :denied, -> { post "/api/day_versions/#{@version.id}/restore" } ],
      "api/day_versions#destroy" => [ :denied, -> { delete "/api/day_versions/#{@version.id}" } ],

      "api/nearby#index" => [ :denied, lambda {
        get "/api/trips/#{@trip.id}/nearby", params: { lat: 35.0, lng: 135.75, radius_km: 5 }
      } ],

      "api/collaborators#index" => [ :denied, -> { get "/api/trips/#{@trip.id}/collaborators" } ],
      "api/collaborators#create" => [ :denied, lambda {
        post "/api/trips/#{@trip.id}/collaborators",
             params: { email: @owner.email, role: "member" }, as: :json
      } ],
      "api/collaborators#update" => [ :denied, lambda {
        patch "/api/trips/#{@trip.id}/collaborators/#{@owner.id}", params: { role: "viewer" }, as: :json
      } ],
      "api/collaborators#destroy" => [ :denied, -> { delete "/api/trips/#{@trip.id}/collaborators/#{@owner.id}" } ],
      "api/collaborators#hand_over" => [ :denied, lambda {
        post "/api/trips/#{@trip.id}/collaborators/#{@owner.id}/hand_over"
      } ],

      "api/feedbacks#index" => [ :empty, -> { get "/api/feedbacks" } ],
      "api/admin/feedbacks#index" => [ :forbidden, -> { get "/api/admin/feedbacks" } ],
      "api/admin/feedbacks#update" => [ :forbidden, lambda {
        patch "/api/admin/feedbacks/#{@feedback.id}", params: { feedback: { status: "rejected" } }, as: :json
      } ],
      "api/admin/feedbacks#destroy" => [ :forbidden, -> { delete "/api/admin/feedbacks/#{@feedback.id}" } ],
      "api/admin/feedbacks#export" => [ :forbidden, -> { get "/api/admin/feedbacks/export" } ],
      "api/feedbacks#create" => [ :open, lambda {
        post "/api/feedbacks", params: { feedback: { message: "Mine, about the app" } }, as: :json
      } ],

      "api/sessions#create" => [ :open, lambda {
        post "/api/session", params: { email: @stranger.email, password: "password123" }, as: :json
      } ],
      "api/sessions#me" => [ :open, -> { get "/api/me" } ],
      "api/sessions#destroy" => [ :open, -> { delete "/api/session" } ],
      "api/users#create" => [ :open, lambda {
        post "/api/users",
             params: { name: "Newcomer", email: "newcomer@example.com", password: "password123" }, as: :json
      } ]
    }
  end
end
