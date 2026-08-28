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

  # Five is a report, not an album. A bug is usually one screenshot; the handful
  # above that covers "before, after, and the console" without turning the upload
  # into something that needs a progress bar or a queue.
  MAX_SCREENSHOTS = 5

  # A full-page retina screenshot is comfortably under this; anything larger is a
  # video, a raw photo, or a mistake. The bound exists mostly to keep one bad
  # upload from filling the R2 bucket.
  MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024

  # What a browser's own screenshot or clipboard paste actually produces, plus
  # GIF so a short screen recording can be dropped in. An allow-list rather than a
  # deny-list: this is an attachment taken from the public internet and rendered
  # back to an admin, so anything not named here -- SVG and its scripts above all
  # -- has no business in the bucket.
  SCREENSHOT_CONTENT_TYPES = %w[image/png image/jpeg image/webp image/gif].freeze

  belongs_to :user

  has_many_attached :screenshots

  validates :message, presence: true, length: { maximum: MESSAGE_LIMIT }
  validates :status, inclusion: { in: STATUSES }

  validate :screenshots_are_reasonable_images

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

  # Reads `screenshots.attachments` rather than the persisted association on
  # purpose. On an unsaved record that collection is the *pending* set -- the
  # files this request is asking us to keep -- and each one already has a blob
  # carrying byte_size and content_type from the upload. Asking the persisted
  # side instead would see nothing here, the record would save, and Active
  # Storage would upload the oversized or executable file to R2 before anyone
  # had decided it was allowed. Rejecting it has to happen while it is still a
  # promise.
  #
  # Messages are written to read after the attribute name Rails prefixes, since
  # they surface verbatim to the reporter through the RecordInvalid -> 422 path:
  # "Screenshots must be 5 MB or smaller".
  def screenshots_are_reasonable_images
    attached = screenshots.attachments
    return if attached.empty?

    messages = []
    messages << "are limited to #{MAX_SCREENSHOTS} per report" if attached.size > MAX_SCREENSHOTS

    attached.filter_map(&:blob).each do |blob|
      messages << "must be a PNG, JPEG, WebP or GIF image" unless SCREENSHOT_CONTENT_TYPES.include?(blob.content_type)
      messages << "must be #{MAX_SCREENSHOT_BYTES / 1.megabyte} MB or smaller" if blob.byte_size.to_i > MAX_SCREENSHOT_BYTES
    end

    # Collected and uniq'd rather than added inside the loop: one file of each
    # kind of wrong is enough to say so, and a six-file drop of PDFs should not
    # answer with the same sentence six times.
    messages.uniq.each { |message| errors.add(:screenshots, message) }
  end
end
