# One date of one trip. It exists only once something has been put on that day
# (or lodging has been set) -- the client merges the trip's date range with the
# rows that come back, so an empty day needs no row.
#
# A trip_day owns one or more DayVersions: the alternate plans for that day.
# Neither trip_days nor day_versions are ever hard-deleted; versions are
# archived instead. See doc/architecture.md section 2.
class TripDay < ApplicationRecord
  include Governed

  belongs_to :trip, class_name: "Entry", inverse_of: :trip_days
  belongs_to :lodging_entry, class_name: "Entry", optional: true, inverse_of: :lodging_trip_days

  # `dependent: :destroy` is a referential-integrity backstop for a trip Entry
  # being destroyed wholesale (which the product never does), not a delete path
  # anything reaches on purpose.
  has_many :day_versions, -> { order(:position, :id) },
           inverse_of: :trip_day, dependent: :destroy

  validates :day, presence: true
  validates :trip_id, uniqueness: { scope: :day }

  scope :for_trip, ->(trip_id) { where(trip_id: trip_id).order(:day) }

  # The trip alone, like ScheduleItem: lodging_entry_id is a reference to what
  # was placed on the day, not authority over the day.
  def governing_entry_ids
    [ trip_id ]
  end

  # The row a write lands on: find it, or make it along with the "Version A"
  # every day is guaranteed to have. Retries once because two concurrent first
  # writes to the same day both pass the uniqueness check before either commits.
  def self.ensure!(trip_id:, day:)
    trip_day = find_or_create_by!(trip_id: trip_id, day: day)
    trip_day.ensure_first_version!
    trip_day
  rescue ActiveRecord::RecordNotUnique
    trip_day = find_by!(trip_id: trip_id, day: day)
    trip_day.ensure_first_version!
    trip_day
  end

  # Exchange two dates of a trip: "move Day 2 to be Day 3" puts Day 3's plan on
  # Day 2 in return, rather than pushing every later day up. Everything the
  # date owns travels -- the trip_day row (so lodging and every version go with
  # it) and the `day` of each schedule_item on it.
  #
  # Either date may be empty; swapping a planned day with an empty one just
  # moves the plan onto the empty date.
  def self.swap_days!(trip_id:, a:, b:)
    return if a == b

    transaction do
      row_a = find_by(trip_id: trip_id, day: a)
      row_b = find_by(trip_id: trip_id, day: b)

      # [trip_id, day] is unique, so the two rows cannot cross over directly:
      # park the first on a date past everything this trip owns, then land it.
      if row_a && row_b
        parking = where(trip_id: trip_id).maximum(:day) + 1
        row_a.update_columns(day: parking, updated_at: Time.current)
        row_b.update_columns(day: a, updated_at: Time.current)
        row_a.update_columns(day: b, updated_at: Time.current)
      else
        row_a&.update_columns(day: b, updated_at: Time.current)
        row_b&.update_columns(day: a, updated_at: Time.current)
      end

      # No unique index on schedule_items.day -- but both sides must be read
      # before either is written, or the first update swallows the second.
      items_a = ScheduleItem.where(trip_id: trip_id, day: a).to_a
      items_b = ScheduleItem.where(trip_id: trip_id, day: b).to_a
      items_a.each { |item| item.update_columns(day: b, updated_at: Time.current) }
      items_b.each { |item| item.update_columns(day: a, updated_at: Time.current) }
    end
  end

  def ensure_first_version!
    return if day_versions.reload.any?

    day_versions.create!(name: DayVersion.name_for(0), position: 0)
  end

  def live_versions
    day_versions.live
  end

  def first_live_version
    live_versions.first
  end

  # Duplicate the last live version so two plans for the day can sit side by
  # side. The new version takes the next letter (A -> B -> C, counted over
  # every version the day has ever had, archived included) and a copy of every
  # schedule_item in the source.
  def fork!
    source = live_versions.to_a.last

    transaction do
      forked = day_versions.create!(name: next_version_name, position: next_version_position)
      source&.schedule_items&.each { |item| forked.copy_item!(item) }
      forked
    end
  end

  def next_version_name
    DayVersion.name_for(day_versions.count)
  end

  # The first "Version X" no version on this day is using. `fork!` counts
  # instead (so letters keep climbing); `restore!` fills the gap the archived
  # version left behind.
  def next_free_version_name(except: nil)
    taken = day_versions.where.not(id: except).pluck(:name).to_set
    index = 0
    index += 1 while taken.include?(DayVersion.name_for(index))
    DayVersion.name_for(index)
  end

  def next_version_position
    (day_versions.maximum(:position) || -1) + 1
  end

  def lodging_title
    lodging_entry&.title.presence || lodging_label.presence
  end
end
