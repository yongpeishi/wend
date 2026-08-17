# Entry is the single node type for the whole product: trips, ideas, and bundles
# are all Entry rows distinguished by `kind`. Structure (trip contains ideas, ideas
# contain sub-ideas, bundles gather ideas) lives entirely in the self-referencing
# EntryLink join table, never in a column on Entry itself. See doc/architecture.md §2-3.
class Entry < ApplicationRecord
  include Governed

  DEFAULT_DEPTH_CAP = 10
  VISIBILITY_DEPTH_CAP = 20

  # Bounds on the pros/cons JSON columns -- see the pros/cons section below.
  PRO_CON_LIMIT = 50
  PRO_CON_TEXT_LIMIT = 200

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
  has_many :trip_days, foreign_key: :trip_id, inverse_of: :trip, dependent: :destroy
  has_many :lodging_trip_days, class_name: "TripDay", foreign_key: :lodging_entry_id,
                               inverse_of: :lodging_entry, dependent: :nullify

  has_many :trip_memberships, class_name: "TripMembership", foreign_key: :trip_id, inverse_of: :trip, dependent: :delete_all

  enum :kind, { trip: "trip", idea: "idea", bundle: "bundle" }, validate: true
  enum :category, {
    place: "place", food: "food", activity: "activity",
    lodging: "lodging", transport: "transport", other: "other"
  }, validate: { allow_nil: true }

  validates :title, presence: true

  after_save :sync_owner_membership, if: :saved_change_to_kind?

  scope :active, -> { where(archived_at: nil) }
  scope :archived_only, -> { where.not(archived_at: nil) }

  # The library: ideas with no trip ancestor (collection mode, not yet committed
  # to a trip). Computed with a single bounded recursive query, not per-row.
  scope :library, -> { idea.where.not(id: with_trip_ancestor_ids) }

  # --- Visibility ------------------------------------------------------------
  # Every entry a user may see, as one bounded recursive walk. Same shape and same
  # depth guard as with_trip_ancestor_ids below.
  #
  #   (a) descend from every trip the user holds a grant on
  #   (b) their own entries that hang under no trip at all -- the library case, and
  #       orphan bundles. kind <> 'trip' is deliberate: trip access has exactly one
  #       authority, a membership row, with no created_by fallback.
  VISIBLE_IDS_SQL = <<~SQL.freeze
    WITH RECURSIVE
      granted(entry_id, role_rank, depth) AS (
        SELECT m.trip_id,
               CASE m.role WHEN 'owner' THEN 3 WHEN 'member' THEN 2 ELSE 1 END,
               0
          FROM trip_memberships m
         WHERE m.user_id = :user_id
        UNION
        SELECT el.child_id, g.role_rank, g.depth + 1
          FROM entry_links el
          INNER JOIN granted g ON el.parent_id = g.entry_id
         WHERE g.depth < :depth_cap
      ),
      in_any_trip(entry_id, depth) AS (
        SELECT el.child_id, 1
          FROM entry_links el
          INNER JOIN entries e ON e.id = el.parent_id AND e.kind = 'trip'
        UNION
        SELECT el.child_id, t.depth + 1
          FROM entry_links el
          INNER JOIN in_any_trip t ON el.parent_id = t.entry_id
         WHERE t.depth < :depth_cap
      )
    SELECT entry_id FROM granted
    UNION
    SELECT e.id FROM entries e
     WHERE e.created_by_id = :user_id
       AND e.kind <> 'trip'
       AND e.id NOT IN (SELECT entry_id FROM in_any_trip)
  SQL

  # An IN subquery, not a pluck: no ids round-trip through Ruby and the scope
  # composes with the other filters in EntriesController#index.
  #
  # archived_at does NOT affect visibility. It is a listing filter only -- the
  # owner must be able to see a set-aside trip in order to restore it.
  scope :visible_to, ->(user) {
    where("entries.id IN (#{VISIBLE_IDS_SQL})",
          user_id: user.id, depth_cap: VISIBILITY_DEPTH_CAP)
  }

  # --- Pros / cons -----------------------------------------------------------
  # The qualitative sibling of Vote: free-text reasons for and against, on every
  # kind rather than just trips. Each item is {"id" => String, "text" => String}
  # and the whole array is read and written at once, so it lives in a JSON column
  # instead of a join table. `id` is client-supplied (React key and removal
  # handle) -- we never mint one.
  #
  # These columns are user-writable JSON arriving verbatim from the client, so
  # the writers normalize rather than validate: junk is dropped and over-long
  # input truncated instead of failing the save, which keeps one malformed item
  # from rejecting an otherwise good list. The two caps are what stop a client
  # from parking unbounded data on the row.

  def pros
    coerce_pro_con(super)
  end

  def cons
    coerce_pro_con(super)
  end

  def pros=(value)
    super(normalize_pro_con(value))
  end

  def cons=(value)
    super(normalize_pro_con(value))
  end

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

  # --- Permission ------------------------------------------------------------

  # An Entry speaks for itself.
  def governing_entry_ids
    [ id ]
  end

  # Effective role on one entry: the strongest grant across its trip ancestors, because
  # an idea can sit under more than one trip. Entries with no trip ancestor belong to
  # their creator outright.
  #
  # Walks UP, which is cheap -- one entry's ancestor set is tiny. Never call this in
  # a loop; the list path resolves roles in one bulk query instead.
  def role_for(user)
    # ancestor_ids_of returns raw select_values, which are not guaranteed Integer --
    # the same .map(&:to_i) EntryLink#no_cycles does.
    ancestor_ids = trip? ? [ id ] : self.class.ancestor_ids_of(id).map(&:to_i)
    roles = TripMembership.where(trip_id: ancestor_ids, user_id: user.id).pluck(:role)
    return roles.max_by { |r| TripMembership::RANK.fetch(r, 0) } if roles.any?

    # The fallback is the library case, and it must agree with VISIBLE_IDS_SQL's
    # second branch exactly: under no TRIP, not under nothing at all -- an idea
    # inside an orphan bundle is still its creator's.
    return nil if trip? || created_by_id != user.id

    "owner" if self.class.where(id: ancestor_ids, kind: "trip").none?
  end

  private

  # A trip needs exactly one owner; an entry that stops being a trip has no use for
  # memberships. Keyed on the kind transition rather than on create, because lift and
  # absorb both change kind after the row already exists.
  def sync_owner_membership
    if trip?
      TripMembership.find_or_create_by!(trip_id: id, user_id: created_by_id) { |m| m.role = "owner" }
    else
      TripMembership.where(trip_id: id).delete_all
    end
  end

  # Rows written before the columns existed read back as NULL, and nothing
  # downstream should have to think about that: always an Array.
  def coerce_pro_con(value)
    value.is_a?(Array) ? value : []
  end

  def normalize_pro_con(value)
    items = value.is_a?(Array) ? value : []
    items.filter_map { |item| normalize_pro_con_item(item) }.first(PRO_CON_LIMIT)
  end

  # Keeps only the two known keys, drops anything that isn't a usable pair, and
  # clamps both strings. An item with no id is dropped too: without one the
  # client cannot key or remove it, so storing it would strand junk on the row.
  def normalize_pro_con_item(item)
    return nil unless item.is_a?(Hash)

    item = item.symbolize_keys
    id = item[:id].to_s.strip
    text = item[:text].to_s.strip
    return nil if id.blank? || text.blank?

    { "id" => id.first(PRO_CON_TEXT_LIMIT), "text" => text.first(PRO_CON_TEXT_LIMIT) }
  end
end
