# One thing placed on one day. A schedule_item is a join-ish row, not something
# the user kept: the Entry it points at is the kept thing and outlives it. That
# is why these may be destroyed outright (unplacing something, or a trip's dates
# shrinking out from under it) while entries and day_versions may only ever be
# archived. See doc/architecture.md section 2.
class ScheduleItem < ApplicationRecord
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

  private

  # `optional: true` means "may be nil", not "may point at nothing" -- without
  # this a stale id from the client reaches the foreign key and 500s instead of
  # coming back as a 422 like every other bad field.
  def day_version_exists
    return if day_version_id.blank? || day_version.present?

    errors.add(:day_version_id, "must exist")
  end

  def ends_not_before_starts
    return if starts_at_minutes.nil? || ends_at_minutes.nil?
    return if ends_at_minutes >= starts_at_minutes

    errors.add(:ends_at_minutes, "must be greater than or equal to starts_at_minutes")
  end
end
