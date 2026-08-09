# Feedback the user leaves *about the app itself* -- deliberately not an Entry.
# Entries model travel content and live in the link graph; a bug report has no
# business being liftable into a trip. See `.claude/interaction/wend-mvp/decisions.md` §8.
class Feedback < ApplicationRecord
  STATUSES = %w[new triaged done].freeze

  # Long enough to be a paragraph, short enough that the column stays sane.
  MESSAGE_LIMIT = 5_000

  belongs_to :user

  validates :message, presence: true, length: { maximum: MESSAGE_LIMIT }
  validates :status, inclusion: { in: STATUSES }

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  # An element capture is only meaningful with a selector; a label on its own
  # would point at nothing. Kept as a normaliser rather than a validation so a
  # sloppy client payload degrades to plain feedback instead of a 422.
  before_validation :drop_orphan_element_label

  def element?
    element_selector.present?
  end

  private

  def drop_orphan_element_label
    self.element_label = nil if element_selector.blank?
  end
end
