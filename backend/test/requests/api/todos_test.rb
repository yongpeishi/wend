require "test_helper"

class Api::TodosTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
  end

  test "GET /api/todos?trip_id=X returns trip-level todos and todos on entries inside the trip" do
    trip = create_trip(created_by: @user)
    idea = create_idea(created_by: @user)
    link!(parent: trip, child: idea)
    unrelated = create_idea(created_by: @user)

    trip_level = Todo.create!(title: "Apply for visa", trip: trip)
    entry_level = Todo.create!(title: "Book table", entry: idea)
    unrelated_todo = Todo.create!(title: "Not in this trip", entry: unrelated)

    get "/api/todos", params: { trip_id: trip.id }
    assert_response :success
    ids = JSON.parse(response.body)["todos"].map { |t| t["id"] }
    assert_includes ids, trip_level.id
    assert_includes ids, entry_level.id
    assert_not_includes ids, unrelated_todo.id
  end

  test "unified todos carry an entry summary" do
    trip = create_trip(title: "Japan", created_by: @user)
    idea = create_idea(title: "Ramen", created_by: @user)
    link!(parent: trip, child: idea)
    Todo.create!(title: "Book table", entry: idea)
    Todo.create!(title: "Apply for visa", trip: trip)

    get "/api/todos", params: { trip_id: trip.id }
    body = JSON.parse(response.body)["todos"]

    entry_todo = body.find { |t| t["title"] == "Book table" }
    assert_equal "Ramen", entry_todo.dig("entry", "title")

    trip_todo = body.find { |t| t["title"] == "Apply for visa" }
    assert_equal "Japan", trip_todo.dig("entry", "title")
  end

  test "GET /api/todos filters by done" do
    idea = create_idea(created_by: @user)
    open_todo = Todo.create!(title: "Open", entry: idea)
    done_todo = Todo.create!(title: "Done", entry: idea, done_at: Time.current)

    get "/api/todos", params: { entry_id: idea.id, done: "false" }
    ids = JSON.parse(response.body)["todos"].map { |t| t["id"] }
    assert_includes ids, open_todo.id
    assert_not_includes ids, done_todo.id
  end

  test "POST creates a todo" do
    idea = create_idea(created_by: @user)
    post "/api/todos", params: { todo: { title: "Book", entry_id: idea.id } }, as: :json
    assert_response :created
  end

  test "POST rejects a todo with neither entry_id nor trip_id" do
    post "/api/todos", params: { todo: { title: "Floating" } }, as: :json
    assert_response :unprocessable_entity
  end

  test "PATCH marks a todo done" do
    todo = Todo.create!(title: "X", entry: create_idea(created_by: @user))
    patch "/api/todos/#{todo.id}", params: { todo: { done_at: Time.current.iso8601 } }, as: :json
    assert_response :success
    assert JSON.parse(response.body).dig("todo", "done_at").present?
  end

  test "DELETE removes a todo" do
    todo = Todo.create!(title: "X", entry: create_idea(created_by: @user))
    delete "/api/todos/#{todo.id}"
    assert_response :no_content
    assert_not Todo.exists?(todo.id)
  end
end
