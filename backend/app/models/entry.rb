# Entry is the single node type for the whole product: trips, ideas, and bundles
# are all Entry rows distinguished by `kind`. Structure (trip contains ideas, ideas
# contain sub-ideas, bundles gather ideas) lives entirely in the self-referencing
# EntryLink join table, never in a column on Entry itself. See doc/architecture.md §2-3.
class Entry < ApplicationRecord
  DEFAULT_DEPTH_CAP = 10

  belongs_to :created_by, class_name: "User"
  belongs_to :from_entry, class_name: "Entry", optional: true
  belongs_to :to_entry, class_name: "Entry", optional: true

  has_many :child_links, class_name: "EntryLink", foreign_key: :parent_id, inverse_of: :parent, dependent: :destroy
  has_many :parent_links, class_name: "EntryLink", foreign_key: :child_id, inverse_of: :child, dependent: :destroy

  has_many :children, -> { order(:position) }, through: :child_links, source: :child
  has_many :parents, through: :parent_links, source: :parent

  has_many :votes, dependent: :destroy
  has_many :todos, foreign_key: :entry_id, inverse_of: :entry, dependent: :destroy
  has_many :trip_todos, class_name: "Todo", foreign_key: :trip_id, inverse_of: :trip, dependent: :destroy
  has_many :schedule_items_as_trip, class_name: "ScheduleItem", foreign_key: :trip_id, dependent: :destroy
  has_many :schedule_items_as_entry, class_name: "ScheduleItem", foreign_key: :entry_id, dependent: :nullify

  enum :kind, { trip: "trip", idea: "idea", bundle: "bundle" }, validate: true
  enum :category, {
    place: "place", food: "food", activity: "activity",
    lodging: "lodging", transport: "transport", other: "other"
  }, validate: { allow_nil: true }

  validates :title, presence: true

  scope :active, -> { where(archived_at: nil) }
  scope :archived_only, -> { where.not(archived_at: nil) }

  # The library: ideas with no trip ancestor (collection mode, not yet committed
  # to a trip). Computed with a single bounded recursive query, not per-row.
  scope :library, -> { idea.where.not(id: with_trip_ancestor_ids) }

  # --- Bulk / class-level tree queries -------------------------------------
  # All use SQLite's WITH RECURSIVE with an explicit depth column capped well
  # below any value a legitimate tree would reach, so even if a cycle somehow
  # slipped past EntryLink's validation the query still terminates.

  def self.ancestor_ids_of(root_id, depth_cap: DEFAULT_DEPTH_CAP)
    sql = <<~SQL
      WITH RECURSIVE ancestors(entry_id, depth) AS (
        SELECT parent_id AS entry_id, 1 AS depth FROM entry_links WHERE child_id = :root_id
        UNION
        SELECT el.parent_id, a.depth + 1
        FROM entry_links el
        INNER JOIN ancestors a ON el.child_id = a.entry_id
        WHERE a.depth < :depth_cap
      )
      SELECT DISTINCT entry_id FROM ancestors
    SQL
    connection.select_values(sanitize_sql_array([sql, root_id: root_id, depth_cap: depth_cap]))
  end

  def self.descendant_ids_of(root_id, depth_cap: DEFAULT_DEPTH_CAP)
    sql = <<~SQL
      WITH RECURSIVE descendants(entry_id, depth) AS (
        SELECT child_id AS entry_id, 1 AS depth FROM entry_links WHERE parent_id = :root_id
        UNION
        SELECT el.child_id, d.depth + 1
        FROM entry_links el
        INNER JOIN descendants d ON el.parent_id = d.entry_id
        WHERE d.depth < :depth_cap
      )
      SELECT DISTINCT entry_id FROM descendants
    SQL
    connection.select_values(sanitize_sql_array([sql, root_id: root_id, depth_cap: depth_cap]))
  end

  # ids of every entry that has at least one kind:"trip" ancestor.
  def self.with_trip_ancestor_ids(depth_cap: 20)
    sql = <<~SQL
      WITH RECURSIVE trip_descendants(entry_id, depth) AS (
        SELECT el.child_id AS entry_id, 1 AS depth
        FROM entry_links el
        INNER JOIN entries e ON e.id = el.parent_id AND e.kind = 'trip'
        UNION
        SELECT el.child_id, td.depth + 1
        FROM entry_links el
        INNER JOIN trip_descendants td ON el.parent_id = td.entry_id
        WHERE td.depth < :depth_cap
      )
      SELECT DISTINCT entry_id FROM trip_descendants
    SQL
    connection.select_values(sanitize_sql_array([sql, depth_cap: depth_cap]))
  end

  # --- Instance tree walks ---------------------------------------------------

  def ancestors(depth: DEFAULT_DEPTH_CAP)
    ids = self.class.ancestor_ids_of(id, depth_cap: depth)
    self.class.where(id: ids)
  end

  def descendants(depth: DEFAULT_DEPTH_CAP)
    ids = self.class.descendant_ids_of(id, depth_cap: depth)
    self.class.where(id: ids)
  end

  # trip-kind ancestors of this entry (an idea can be under >1 trip at once).
  def trips(depth: DEFAULT_DEPTH_CAP)
    ancestors(depth: depth).where(kind: "trip")
  end

  def library?
    idea? && trips.none?
  end

  def archive!
    update!(archived_at: Time.current)
  end

  def restore!
    update!(archived_at: nil)
  end
end
