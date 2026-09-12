# The hours one member of a plan keeps on one placement of that plan. A plan (a
# bundle entry) placed on a day is a single schedule_item; its members are read
# off entry_links at render time and, until someone times one, only ever get
# hours derived from the band. This row is what a member gets once someone does.
#
# Sparse: no row means "no time yet", which is a real state the itinerary shows
# in words rather than a blank. Both minutes may be nil on a row too, which the
# controller treats as "take the row out" -- so in practice a stored row carries
# at least one of them.
#
# Hangs off the placement, not the entry or the link, so a plan placed twice
# (two days, or two versions of one day) is timed separately each time and a
# fork copies its own set. The same placement-vs-kept split as ScheduleItem, one
# level down -- see doc/architecture.md section 2.
#
# Not Governed: nothing authorizes one of these directly. The controller
# authorizes the parent schedule_item, and the member check below is what keeps
# the row inside that item's trip.
class ScheduleItemMemberTime < ApplicationRecord
  belongs_to :schedule_item, inverse_of: :member_times
  belongs_to :entry, inverse_of: :schedule_item_member_times

  validates :starts_at_minutes,
            numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1439 },
            allow_nil: true
  validates :ends_at_minutes,
            numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1439 },
            allow_nil: true
  validate :ends_not_before_starts

  # entry_id arrives from the route, and the policy layer only ever looked at
  # the parent item's trip -- so this is the one thing stopping a member of the
  # trip from timing an entry that is not in this plan at all, including one
  # from a trip they cannot see. Being a child of the placed bundle is both the
  # membership rule and the trip-scoping rule: a bundle's members are inside
  # its trip already.
  #
  # Gated on the keys changing, the same way ScheduleItem gates its own
  # descendant walk: re-timing an existing row does not re-check the link.
  validate :entry_is_member_of_bundle, if: :membership_changing?

  private

  def membership_changing?
    new_record? || will_save_change_to_entry_id? || will_save_change_to_schedule_item_id?
  end

  # Deliberately ONE message for a nonexistent id, someone else's id, an entry
  # in this trip that is simply not in this plan, and a placed thing that is not
  # a plan at all: entry ids are sequential, and a distinct answer for any of
  # those would let a caller probe which ids are real.
  def entry_is_member_of_bundle
    # belongs_to has already said "must exist" for a missing parent or entry.
    return if schedule_item.nil? || entry_id.blank?
    return if schedule_item.entry&.bundle? &&
              EntryLink.exists?(parent_id: schedule_item.entry_id, child_id: entry_id)

    errors.add(:entry_id, "must be a member of this plan")
  end

  def ends_not_before_starts
    return if starts_at_minutes.nil? || ends_at_minutes.nil?
    return if ends_at_minutes >= starts_at_minutes

    errors.add(:ends_at_minutes, "must be greater than or equal to starts_at_minutes")
  end
end
