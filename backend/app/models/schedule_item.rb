# One thing placed on one day. A schedule_item is a join-ish row, not something
# the user kept: the Entry it points at is the kept thing and outlives it. That
# is why these may be destroyed outright (unplacing something, or a trip's dates
# shrinking out from under it) while entries and day_versions may only ever be
# archived. See doc/architecture.md section 2.
class ScheduleItem < ApplicationRecord
  include Governed

  belongs_to :trip, class_name: "Entry"
  belongs_to :entry, class_name: "Entry", optional: true
  belongs_to :chosen_entry, class_name: "Entry", optional: true

  # Nullable so the older final-schedule screen, which POSTs a bare `day`, keeps
  # working. The controller resolves the day's first live version on write, so
  # in practice nothing new lands here without one.
  belongs_to :day_version, optional: true, inverse_of: :schedule_items

  # Two different questions get asked of these rows, and answering both with
  # "every schedule_item for the day" is the bug this pair of scopes exists to
  # stop. Neither ever counts an ARCHIVED version: that is a plan the user
  # explicitly rejected, and it must not come back on any screen.
  #
  # A null day_version_id is in both: those are rows that predate day_versions
  # and they must not vanish from anything.

  # "What is the plan for this day?" -- one plan, the day's first live version.
  # The Final schedule screen (GET /api/trips/:trip_id/schedule) is the reader:
  # it is a single grid meant to be read while travelling, so a day that has
  # been forked must still hand it one column, not both stacked on top of each
  # other. `keep!` on the loser is what changes the answer.
  scope :in_final_plan, lambda {
    where(day_version_id: nil).or(where(day_version_id: DayVersion.first_of_each_day.select(:id)))
  }

  # "Has this entry been placed anywhere yet?" -- any LIVE version counts, so a
  # fork under comparison keeps both of its alternatives off the unplaced rail.
  # This is the rule the itinerary screen computes for itself client-side
  # ("in no live version of any day"); `Entry#scheduled`, `GET /api/entries
  # ?scheduled=` and nearby's `exclude_scheduled` answer it server-side and
  # must agree, or the same entry reads as placed on one screen and free on
  # another.
  scope :placed, lambda {
    where(day_version_id: nil).or(where(day_version_id: DayVersion.where(archived_at: nil).select(:id)))
  }

  validates :day, presence: true
  validates :starts_at_minutes,
            numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1439 },
            allow_nil: true
  validates :ends_at_minutes,
            numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1439 },
            allow_nil: true
  validate :ends_not_before_starts
  validate :day_version_exists

  # entry_id, chosen_entry_id and day_version_id all arrive verbatim inside
  # writable params, and the policy layer only ever checks trip_id -- so these
  # validations are the sole thing stopping an authenticated member from
  # smuggling a foreign id into their own trip: reading a stranger's entry back
  # through the serializers, or planting a row inside another trip's itinerary
  # via its day version. The invariant: every foreign key on a schedule_item
  # points inside the trip the row belongs to.
  #
  # Gated on will_save_change_to_* so the recursive descendant walk only runs
  # when a foreign key is actually being (re)pointed, not on every unrelated
  # save of an existing row.
  validate :entry_fks_belong_to_trip, if: :entry_fk_changing?
  validate :day_version_belongs_to_trip, if: :will_save_change_to_day_version_id?

  # The trip alone. entry_id and chosen_entry_id are references to what was placed,
  # not authority over it.
  def governing_entry_ids
    [ trip_id ]
  end

  private

  # `optional: true` means "may be nil", not "may point at nothing" -- without
  # this a stale id from the client reaches the foreign key and 500s instead of
  # coming back as a 422 like every other bad field.
  def day_version_exists
    return if day_version_id.blank? || day_version.present?

    errors.add(:day_version_id, "must exist")
  end

  def entry_fk_changing?
    (entry_id.present? && will_save_change_to_entry_id?) ||
      (chosen_entry_id.present? && will_save_change_to_chosen_entry_id?)
  end

  # One descendant walk covers both entry foreign keys. Depth cap matches
  # Entry.visible_to's, so anything a member can see under the trip is also
  # placeable -- a tighter cap here would reject deep-but-visible entries.
  #
  # Deliberately ONE message for both a nonexistent id and someone else's id:
  # entry ids are sequential, and a distinct "does not exist" answer would let a
  # caller probe which ids are real. (This also turns the nonexistent-id case
  # from a foreign-key 500 into a 422 like every other bad field.)
  def entry_fks_belong_to_trip
    # descendant_ids_of returns raw select_values, which are not guaranteed
    # Integer -- the same .map(&:to_i) Entry#role_for does.
    descendant_ids = Entry.descendant_ids_of(trip_id, depth_cap: Entry::VISIBILITY_DEPTH_CAP).map(&:to_i)

    if entry_id.present? && will_save_change_to_entry_id? && !descendant_ids.include?(entry_id)
      errors.add(:entry_id, "must belong to this trip")
    end
    if chosen_entry_id.present? && will_save_change_to_chosen_entry_id? && !descendant_ids.include?(chosen_entry_id)
      errors.add(:chosen_entry_id, "must belong to this trip")
    end
  end

  # A day_version that exists but hangs off another trip's day is how a member
  # of trip A plants a row inside trip B's itinerary (the itinerary read walks
  # trip -> days -> versions -> items and trusts every hop). Dangling ids are
  # day_version_exists's job -- day_version.nil? defers to its "must exist".
  def day_version_belongs_to_trip
    return if day_version_id.blank? || day_version.nil?
    return if day_version.trip_day&.trip_id == trip_id

    errors.add(:day_version_id, "must belong to this trip")
  end

  def ends_not_before_starts
    return if starts_at_minutes.nil? || ends_at_minutes.nil?
    return if ends_at_minutes >= starts_at_minutes

    errors.add(:ends_at_minutes, "must be greater than or equal to starts_at_minutes")
  end
end
