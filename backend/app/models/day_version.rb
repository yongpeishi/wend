# One plan for one day. A day may carry several so alternatives can be compared
# side by side; the ones not chosen are archived, never destroyed, so a change
# of mind costs nothing. A day always keeps at least one live version.
class DayVersion < ApplicationRecord
  belongs_to :trip_day, inverse_of: :day_versions

  # Schedule items are join-ish rows: the Entry they point at is what was kept,
  # and it survives untouched. So unlike entries and versions they may be
  # destroyed outright -- `ungroup` does exactly that to the bundle row it
  # replaces. `nullify` here only matters in a cascade from a destroyed trip.
  has_many :schedule_items, -> { order(:starts_at_minutes, :position, :id) },
           inverse_of: :day_version, dependent: :nullify

  validates :name, presence: true
  validates :position, presence: true

  scope :live, -> { where(archived_at: nil).order(:position, :id) }
  scope :archived_only, -> { where.not(archived_at: nil).order(archived_at: :desc, id: :desc) }

  # The single version each day's *finished* plan is read from: the first live
  # one, by the same order `live` uses (position, then id). Set-shaped rather
  # than ordered, so it can be used as a subquery -- see
  # ScheduleItem.in_final_plan, which is what the Final schedule screen reads
  # through. A second live version (a fork being compared) and every archived
  # version (a plan the user rejected) are deliberately outside it.
  scope :first_of_each_day, lambda {
    where(archived_at: nil).where(
      "NOT EXISTS (SELECT 1 FROM day_versions earlier" \
      " WHERE earlier.trip_day_id = day_versions.trip_day_id" \
      " AND earlier.archived_at IS NULL" \
      " AND (earlier.position < day_versions.position" \
      " OR (earlier.position = day_versions.position AND earlier.id < day_versions.id)))"
    )
  }

  # "Version A", "Version B", ... and past Z, "Version AA" -- spreadsheet
  # style, so a day can be forked more than 26 times without a collision.
  def self.name_for(index)
    letters = +""
    n = index.to_i
    loop do
      letters.prepend(("A".ord + (n % 26)).chr)
      n = n / 26 - 1
      break if n.negative?
    end
    "Version #{letters}"
  end

  def archived?
    archived_at.present?
  end

  # This is the one we are going with. Every live sibling is archived (kept, in
  # case of a change of mind) and the survivor becomes "Version A" again, since
  # a day with a single plan should not read as "Version C".
  #
  # A no-op when there is nothing to choose between.
  def keep!
    siblings = trip_day.day_versions.live.where.not(id: id).to_a
    return self if siblings.empty?

    transaction do
      siblings.each { |sibling| sibling.update!(archived_at: Time.current) }
      update!(name: DayVersion.name_for(0), position: 0)
    end
    self
  end

  # Archive, never destroy. Refused when this is the day's only live version --
  # a day is never left with no plan at all.
  def archive!
    return false if last_live_version?

    update!(archived_at: Time.current)
  end

  # Back on the table: appended to the end of the live list under the first
  # letter nobody is using, which is usually the one this version gave up when
  # `keep!` renamed the survivor to "Version A".
  def restore!
    transaction do
      update!(
        archived_at: nil,
        name: trip_day.next_free_version_name(except: id),
        position: (trip_day.day_versions.where(archived_at: nil).where.not(id: id).maximum(:position) || -1) + 1
      )
    end
    self
  end

  def last_live_version?
    !archived? && trip_day.day_versions.live.count <= 1
  end

  # Copy a schedule_item into this version: same entry, same times, same note,
  # same slot in the order. Used by TripDay#fork!.
  def copy_item!(item)
    schedule_items.create!(
      trip_id: item.trip_id,
      entry_id: item.entry_id,
      chosen_entry_id: item.chosen_entry_id,
      day: item.day,
      starts_at_minutes: item.starts_at_minutes,
      ends_at_minutes: item.ends_at_minutes,
      note: item.note,
      position: item.position
    )
  end
end
