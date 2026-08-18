require "test_helper"

class EntryLinkTest < ActiveSupport::TestCase
  test "valid link between two distinct entries saves" do
    parent = create_bundle
    child = create_idea
    link = EntryLink.new(parent: parent, child: child, position: 0)
    assert link.valid?
    assert link.save
  end

  test "rejects a direct self-link (A -> A)" do
    entry = create_idea
    link = EntryLink.new(parent: entry, child: entry, position: 0)
    assert_not link.valid?
    assert_includes link.errors[:child_id].join, "itself"
  end

  test "rejects a two-hop cycle (A -> B -> A)" do
    a = create_idea(title: "A")
    b = create_idea(title: "B")
    link!(parent: a, child: b)

    cycle = EntryLink.new(parent: b, child: a, position: 0)
    assert_not cycle.valid?
    assert_includes cycle.errors[:base].join, "cycle"
  end

  test "rejects a deep cycle (A -> B -> C -> A)" do
    a = create_idea(title: "A")
    b = create_idea(title: "B")
    c = create_idea(title: "C")
    link!(parent: a, child: b)
    link!(parent: b, child: c)

    cycle = EntryLink.new(parent: c, child: a, position: 0)
    assert_not cycle.valid?
    assert_includes cycle.errors[:base].join, "cycle"
  end

  test "does not hang on a deep non-cyclic chain" do
    root = create_idea(title: "root")
    previous = root
    24.times do |i|
      node = create_idea(title: "node #{i}")
      link!(parent: previous, child: node)
      previous = node
    end

    # Linking a fresh, unrelated entry under the deepest node is fine (no cycle).
    fresh = create_idea(title: "fresh")
    link = EntryLink.new(parent: previous, child: fresh, position: 0)
    assert link.valid?
  end

  test "a child may have many parents, and duplicate parent/child pairs are rejected" do
    parent_a = create_bundle(title: "A")
    parent_b = create_bundle(title: "B")
    child = create_idea

    link!(parent: parent_a, child: child)
    link!(parent: parent_b, child: child)
    assert_equal 2, child.parent_links.count

    dup = EntryLink.new(parent: parent_a, child: child, position: 1)
    assert_not dup.valid?
  end

  # --- next_position_for -----------------------------------------------------

  test "next_position_for starts a childless parent at 0" do
    parent = create_bundle
    assert_equal 0, EntryLink.next_position_for(parent.id)
  end

  test "next_position_for appends after the current maximum, gaps included" do
    parent = create_bundle
    link!(parent: parent, child: create_idea(title: "first"), position: 0)
    # A gap can exist after deletes; appending goes after the max, not into it.
    link!(parent: parent, child: create_idea(title: "later"), position: 5)

    assert_equal 6, EntryLink.next_position_for(parent.id)
  end

  test "next_position_for only counts the given parent's children" do
    parent = create_bundle(title: "mine")
    other = create_bundle(title: "other")
    link!(parent: other, child: create_idea, position: 9)

    assert_equal 0, EntryLink.next_position_for(parent.id)
  end
end
