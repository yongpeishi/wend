class Todo < ApplicationRecord
  include Governed

  belongs_to :entry, class_name: "Entry", optional: true, inverse_of: :todos
  belongs_to :trip, class_name: "Entry", optional: true, inverse_of: :trip_todos

  validates :title, presence: true
  validate :entry_or_trip_present

  scope :open, -> { where(done_at: nil) }
  scope :done, -> { where.not(done_at: nil) }

  def done?
    done_at.present?
  end

  # Conjunction: a todo hung off both a trip and an entry needs both permitted.
  def governing_entry_ids
    [ trip_id, entry_id ].compact
  end

  private

  def entry_or_trip_present
    errors.add(:base, "must belong to an entry or a trip") if entry_id.blank? && trip_id.blank?
  end
end
