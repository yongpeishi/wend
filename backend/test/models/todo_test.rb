require "test_helper"

class TodoTest < ActiveSupport::TestCase
  test "requires a title" do
    todo = Todo.new(entry: create_idea)
    assert_not todo.valid?
    assert_includes todo.errors.attribute_names, :title
  end

  test "requires at least one of entry_id or trip_id" do
    todo = Todo.new(title: "Do the thing")
    assert_not todo.valid?
    assert_includes todo.errors[:base].join, "entry or a trip"
  end

  test "valid when only entry_id is present" do
    todo = Todo.new(title: "Book table", entry: create_idea)
    assert todo.valid?
  end

  test "valid when only trip_id is present (trip-level todo, e.g. apply for visa)" do
    todo = Todo.new(title: "Apply for visa", trip: create_trip)
    assert todo.valid?
  end

  test "valid when both entry_id and trip_id are present" do
    trip = create_trip
    idea = create_idea
    todo = Todo.new(title: "Confirm booking", entry: idea, trip: trip)
    assert todo.valid?
  end

  test "done? reflects done_at" do
    todo = Todo.create!(title: "X", trip: create_trip)
    assert_not todo.done?
    todo.update!(done_at: Time.current)
    assert todo.done?
  end
end
