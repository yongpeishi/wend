# The self-referencing M:M join that carries all of Entry's tree structure.
# Cycle prevention here is load-bearing: every ancestor/descendant walk in the
# app assumes the graph is a DAG. A cycle that slips through would hang those
# walks and, per the brief, take the whole app down.
class EntryLink < ApplicationRecord
  MAX_CYCLE_CHECK_DEPTH = 1000

  belongs_to :parent, class_name: "Entry", inverse_of: :child_links
  belongs_to :child, class_name: "Entry", inverse_of: :parent_links

  validates :position, presence: true, numericality: { only_integer: true }
  validates :child_id, uniqueness: { scope: :parent_id }

  validate :not_self_referential
  validate :no_cycles

  # Appends after the parent's current last child. `|| -1` makes the first
  # child land at 0, so positions stay a dense 0-based run that the ordered
  # child walks assume.
  def self.next_position_for(parent_id)
    (where(parent_id: parent_id).maximum(:position) || -1) + 1
  end

  private

  def not_self_referential
    return if parent_id.blank? || child_id.blank?
    errors.add(:child_id, "can't link an entry to itself") if parent_id == child_id
  end

  # Adding parent -> child would create a cycle if `parent` is already reachable
  # by walking down from `child` (i.e. parent is one of child's descendants) --
  # that would make parent an ancestor of itself once the new link is added.
  def no_cycles
    return if parent_id.blank? || child_id.blank?
    return if errors[:child_id].present? # already caught by not_self_referential

    descendant_ids = Entry.descendant_ids_of(child_id, depth_cap: MAX_CYCLE_CHECK_DEPTH)
    if descendant_ids.map(&:to_i).include?(parent_id)
      errors.add(:base, "would create a cycle: parent is already a descendant of child")
    end
  end
end
