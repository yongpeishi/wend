require "test_helper"

class EntryTest < ActiveSupport::TestCase
  test "requires a title" do
    entry = Entry.new(kind: "idea", created_by: create_user)
    assert_not entry.valid?
    assert_includes entry.errors.attribute_names, :title
  end

  test "kind must be one of trip idea bundle" do
    entry = Entry.new(title: "X", created_by: create_user)
    entry.kind = "not_a_kind"
    assert_not entry.valid?
    assert_includes entry.errors.attribute_names, :kind
  end

  test "category allows nil (trips and bundles have no category)" do
    trip = create_trip
    assert_nil trip.category
    assert trip.valid?
  end

  test "category must be one of the six values when present" do
    idea = Entry.new(kind: "idea", title: "X", created_by: create_user)
    idea.category = "not_a_category"
    assert_not idea.valid?
    assert_includes idea.errors.attribute_names, :category
  end

  test "kind scope filters by kind" do
    trip = create_trip
    idea = create_idea
    assert_includes Entry.trip, trip
    assert_not_includes Entry.trip, idea
    assert_includes Entry.idea, idea
  end

  test "category scope filters by category" do
    food = create_idea(category: "food")
    place = create_idea(category: "place")
    assert_includes Entry.food, food
    assert_not_includes Entry.food, place
  end

  test "active scope excludes archived entries" do
    live = create_idea
    archived = create_idea
    archived.archive!
    assert_includes Entry.active, live
    assert_not_includes Entry.active, archived
  end

  test "archive! sets archived_at and restore! clears it" do
    idea = create_idea
    assert_nil idea.archived_at
    idea.archive!
    assert idea.archived_at.present?
    idea.restore!
    assert_nil idea.reload.archived_at
  end

  test "archiving never destroys the row" do
    idea = create_idea
    idea.archive!
    assert Entry.unscoped.exists?(idea.id)
  end

  test "library scope returns ideas with no trip ancestor" do
    trip = create_trip
    under_trip = create_idea(title: "Under trip")
    link!(parent: trip, child: under_trip)

    orphan_idea = create_idea(title: "Orphan")

    assert_includes Entry.library, orphan_idea
    assert_not_includes Entry.library, under_trip
    assert_not_includes Entry.library, trip # trips are never in the library (wrong kind)
  end

  test "library scope excludes ideas nested two levels under a trip" do
    trip = create_trip
    mid = create_idea(title: "Mid")
    leaf = create_idea(title: "Leaf")
    link!(parent: trip, child: mid)
    link!(parent: mid, child: leaf)

    assert_not_includes Entry.library, leaf
  end

  test "ancestors walks up through multiple parents" do
    trip = create_trip
    mid = create_idea(title: "Mid")
    leaf = create_idea(title: "Leaf")
    link!(parent: trip, child: mid)
    link!(parent: mid, child: leaf)

    ancestor_titles = leaf.ancestors.pluck(:title)
    assert_includes ancestor_titles, "Mid"
    assert_includes ancestor_titles, trip.title
  end

  test "descendants walks down through multiple children" do
    trip = create_trip
    mid = create_idea(title: "Mid")
    leaf = create_idea(title: "Leaf")
    link!(parent: trip, child: mid)
    link!(parent: mid, child: leaf)

    descendant_titles = trip.descendants.pluck(:title)
    assert_includes descendant_titles, "Mid"
    assert_includes descendant_titles, "Leaf"
  end

  test "descendants respects a depth cap" do
    trip = create_trip
    a = create_idea(title: "A")
    b = create_idea(title: "B")
    c = create_idea(title: "C")
    link!(parent: trip, child: a)
    link!(parent: a, child: b)
    link!(parent: b, child: c)

    shallow = trip.descendants(depth: 1).pluck(:title)
    assert_includes shallow, "A"
    assert_not_includes shallow, "C"

    deep = trip.descendants(depth: 10).pluck(:title)
    assert_includes deep, "C"
  end

  test "trips returns only trip-kind ancestors, an idea can belong to two trips" do
    trip_a = create_trip(title: "Trip A")
    trip_b = create_trip(title: "Trip B")
    shared = create_idea(title: "Shared idea")
    link!(parent: trip_a, child: shared)
    link!(parent: trip_b, child: shared)

    trip_titles = shared.trips.pluck(:title)
    assert_equal ["Trip A", "Trip B"].sort, trip_titles.sort
  end

  test "pros and cons default to empty arrays on every kind" do
    [create_trip, create_idea, create_bundle].each do |entry|
      assert_equal [], entry.pros
      assert_equal [], entry.cons
      assert_equal [], entry.reload.pros
      assert_equal [], entry.reload.cons
    end
  end

  test "pros round-trip through the database as id/text hashes" do
    idea = create_idea
    idea.update!(pros: [{ "id" => "p1", "text" => "Flights are already booked" }])

    assert_equal [{ "id" => "p1", "text" => "Flights are already booked" }], idea.reload.pros
  end

  test "normalization strips text and keeps only the id and text keys" do
    entry = Entry.new(pros: [{ "id" => "p1", "text" => "  Cheap in May  ", "votes" => 99 }])

    assert_equal [{ "id" => "p1", "text" => "Cheap in May" }], entry.pros
  end

  test "normalization accepts symbol keys as well as string keys" do
    entry = Entry.new(cons: [{ id: "c1", text: "Rainy season" }])

    assert_equal [{ "id" => "c1", "text" => "Rainy season" }], entry.cons
  end

  test "normalization drops non-hashes and items with blank text or no id" do
    entry = Entry.new(pros: [
      { "id" => "p1", "text" => "Keep me" },
      { "id" => "p2", "text" => "   " },  # blank after strip
      { "text" => "no id, unremovable" },
      "just a string",
      nil,
      42
    ])

    assert_equal [{ "id" => "p1", "text" => "Keep me" }], entry.pros
  end

  test "a non-array assignment normalizes to an empty array" do
    entry = Entry.new(pros: "nope", cons: { "id" => "c1", "text" => "not in an array" })

    assert_equal [], entry.pros
    assert_equal [], entry.cons
  end

  test "pros and cons are capped in item count and text length" do
    over = (1..(Entry::PRO_CON_LIMIT + 10)).map { |i| { "id" => "p#{i}", "text" => "x" * (Entry::PRO_CON_TEXT_LIMIT + 50) } }
    entry = Entry.new(pros: over, cons: over)

    assert_equal Entry::PRO_CON_LIMIT, entry.pros.size
    assert_equal Entry::PRO_CON_LIMIT, entry.cons.size
    assert_equal Entry::PRO_CON_TEXT_LIMIT, entry.pros.first["text"].length
  end

  test "a NULL column reads back as an empty array" do
    # Rows written before the columns existed. The DB has NOT NULL on both, so
    # the NULL is staged straight onto the attribute rather than through the
    # writer, which is exactly the shape such a row loads with.
    entry = create_idea
    entry[:pros] = nil
    entry[:cons] = nil

    assert_equal [], entry.pros
    assert_equal [], entry.cons
  end

  test "a child may have many parents" do
    bundle_a = create_bundle(title: "Day 1")
    bundle_b = create_bundle(title: "Day 2")
    disneyland = create_idea(title: "Disneyland")
    link!(parent: bundle_a, child: disneyland)
    link!(parent: bundle_b, child: disneyland)

    assert_equal 2, disneyland.parents.count
  end
end
