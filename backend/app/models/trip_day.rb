# One date of one trip. It exists only once something has been put on that day
# (or lodging has been set) -- the client merges the trip's date range with the
# rows that come back, so an empty day needs no row.
#
# A trip_day owns one or more DayVersions: the alternate plans for that day.
# Neither trip_days nor day_versions are ever hard-deleted; versions are
# archived instead. See doc/architecture.md section 2.
class TripDay < ApplicationRecord
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
