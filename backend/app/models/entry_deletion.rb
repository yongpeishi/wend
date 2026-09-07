# The receipt for a destroy that really happened. One append-only row per
# "delete for good", written inside the same transaction as the destroy so the
# two cannot disagree: either the entry is gone and this says so, or neither.
#
# There is no UI, no controller, no serializer and no restore path. It exists so
# that "where did my trip go?" has an answer at all -- everything else about the
# entry is genuinely gone, which is the point of the feature.
class EntryDeletion < ApplicationRecord
  belongs_to :user

  # No belongs_to :entry, and no FK behind entry_id: the row it names has been
  # destroyed, so the association could only ever resolve to nil.
  validates :entry_id, presence: true
  validates :kind, presence: true
  validates :title, presence: true
  validates :deleted_at, presence: true
  validates :descendants_destroyed, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  # Append-only, enforced rather than merely documented: a written row can never
  # be edited or removed through the model. `persisted?` rather than a flat true
  # so creating one still works.
  def readonly? = persisted?
end
