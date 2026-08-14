class ScheduleItem < ApplicationRecord
  include Governed

  belongs_to :trip, class_name: "Entry"
  belongs_to :entry, class_name: "Entry", optional: true
  belongs_to :chosen_entry, class_name: "Entry", optional: true

  validates :day, presence: true
  validates :starts_at_minutes,
            numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1439 },
            allow_nil: true
  validates :ends_at_minutes,
            numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1439 },
            allow_nil: true
  validate :ends_not_before_starts

  # The trip alone. entry_id and chosen_entry_id are references to what was placed,
  # not authority over it.
  def governing_entry_ids
    [ trip_id ]
  end

  private

  def ends_not_before_starts
    return if starts_at_minutes.nil? || ends_at_minutes.nil?
    return if ends_at_minutes >= starts_at_minutes

    errors.add(:ends_at_minutes, "must be greater than or equal to starts_at_minutes")
  end
end
