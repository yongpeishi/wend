# What a trip's new date range does to everything already planned on it.
#
# Placement is keyed by a real calendar date, but "Day 2" is what the user
# actually planned: an offset from the trip's start. So moving the start moves
# the whole plan with it -- shift every trip_day and every schedule_item by
# (new start - old start) and Day 2 is still Day 2, now on a new date.
#
# Shrinking a trip can push a planned day past the end of the range. Those days
# are *dropped*: their placements go away and the ideas fall back onto the
# "Not placed yet" rail. That loses work, so the caller has to ask for it --
# `dropped_days` is the warning, `confirm_dropped_days` is the answer. Nothing
# kept is destroyed either way: only trip_days, day_versions and schedule_items
# go, never an Entry.
class TripDateShift
  attr_reader :trip, :starts_on, :ends_on, :shift_days

  # Build the shift a PATCH of `attrs` would cause. A write that names neither
  # date leaves both bounds nil, which reads as "unbounded" below -- renaming a
  # trip must never drop a day, even one that was already out of range.
  def self.for(trip, attrs)
    named = ->(key) { attrs.respond_to?(:key?) && attrs.key?(key) }
    return new(trip: trip) unless named.call("starts_on") || named.call("ends_on")

    new(
      trip: trip,
      starts_on: named.call("starts_on") ? cast_date(attrs["starts_on"]) : trip.starts_on,
      ends_on: named.call("ends_on") ? cast_date(attrs["ends_on"]) : trip.ends_on,
      old_starts_on: trip.starts_on
    )
  end

  def self.cast_date(value)
    Entry.type_for_attribute("starts_on").cast(value)
  end

  def initialize(trip:, starts_on: nil, ends_on: nil, old_starts_on: nil)
    @trip = trip
    @starts_on = starts_on
    @ends_on = ends_on
    # No previous start means there was no "Day 2" to preserve, so nothing moves.
    @shift_days = starts_on && old_starts_on ? (starts_on - old_starts_on).to_i : 0
  end

  # Post-shift dates that fall outside the new range, ascending.
  def dropped_days
    @dropped_days ||= planned_days.map { |day| day + shift_days }.reject { |day| in_range?(day) }.sort
  end

  def dropped_item_count
    return 0 if dropped_days.empty?

    ScheduleItem.where(trip_id: trip.id, day: dropped_days.map { |day| day - shift_days }).count
  end

  def dropped_days?
    dropped_days.any?
  end

  # Move the plan, then clear whatever ended up off the end. Call inside the
  # same transaction as the trip's own date update: half of this applied is a
  # plan pointing at the wrong dates.
  def apply!
    return if shift_days.zero? && dropped_days.empty?

    dropped_days # read the plan's current shape before any of it moves
    shift!
    drop!
  end

  private

  # Every date this trip has put something on. schedule_items are read too, not
  # just trip_days: rows written before day_versions existed can sit on a date
  # with no trip_day row, and they must travel with the rest.
  def planned_days
    @planned_days ||= (
      TripDay.where(trip_id: trip.id).pluck(:day) +
        ScheduleItem.where(trip_id: trip.id).distinct.pluck(:day)
    ).compact.uniq
  end

  def in_range?(day)
    return false if starts_on.present? && day < starts_on
    return false if ends_on.present? && day > ends_on

    true
  end

  # `trip_days` is uniquely indexed on [trip_id, day], and a shift walks rows
  # onto dates their neighbours are still sitting on. Moving forward, start
  # from the last day (the date above it is free); moving back, start from the
  # first. Either way every single-row update lands somewhere empty.
  #
  # `update_columns` rather than `update!`: this is date arithmetic on the row
  # itself, and it must not touch `day_version_id` or wake anything that
  # archives versions.
  def shift!
    return if shift_days.zero?

    order = shift_days.positive? ? :desc : :asc
    TripDay.where(trip_id: trip.id).order(day: order).to_a.each do |trip_day|
      trip_day.update_columns(day: trip_day.day + shift_days, updated_at: Time.current)
    end

    # No unique index on schedule_items.day, so order does not matter here.
    ScheduleItem.where(trip_id: trip.id).to_a.each do |item|
      item.update_columns(day: item.day + shift_days, updated_at: Time.current)
    end
  end

  # Placements only. The Entry each item pointed at is untouched, which is what
  # makes those ideas reappear under "Not placed yet" instead of vanishing.
  def drop!
    return if dropped_days.empty?

    ScheduleItem.where(trip_id: trip.id, day: dropped_days).destroy_all
    TripDay.where(trip_id: trip.id, day: dropped_days).destroy_all
  end
end
