# Feedback the user leaves *about the app itself* -- deliberately not an Entry.
# Entries model travel content and live in the link graph; a bug report has no
# business being liftable into a trip. See `.claude/interaction/wend-mvp/decisions.md` §8.
#
# Nothing here keeps text the user typed *into the page*. An element capture is a
# URL, a selector and a class attribute -- all three authored by us. The only
# thing a user wrote that this table stores is `message`, which they wrote
# knowing it was a report.
class Feedback < ApplicationRecord
  # Triage in three words: unread, looked at and not being acted on, dealt with.
  # `rejected` replaced `triaged` (migration 20260828120000) -- "triaged" named
  # the act of reading rather than the outcome, so every note that had been read
  # sat in it forever and the column stopped sorting the pile.
  STATUSES = %w[new rejected done].freeze

  # Long enough to be a paragraph, short enough that the column stays sane.
  MESSAGE_LIMIT = 5_000

  belongs_to :user

  validates :message, presence: true, length: { maximum: MESSAGE_LIMIT }
  validates :status, inclusion: { in: STATUSES }

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  # The admin list's narrowing, as a scope so the CSV export and any later
  # reader share one definition of it. An empty list is no narrowing at all
  # rather than an empty result: "show me none of the statuses" is not a thing
  # anyone means, and it is what an untouched filter would otherwise ask for.
  # Unknown values are dropped, so a hand-edited URL widens rather than 422s.
  scope :with_statuses, lambda { |statuses|
    wanted = Array(statuses).map(&:to_s) & STATUSES
    wanted.empty? ? all : where(status: wanted)
  }

  # An element capture is only meaningful with a selector; a class attribute on
  # its own points at nothing. Kept as a normaliser rather than a validation so
  # a sloppy client payload degrades to plain feedback instead of a 422.
  before_validation :drop_orphan_element_classes

  def element?
    element_selector.present?
  end

  private

  def drop_orphan_element_classes
    self.element_classes = nil if element_selector.blank?
  end
end
