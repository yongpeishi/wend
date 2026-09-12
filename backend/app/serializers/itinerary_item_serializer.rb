# The itinerary screen's view of a schedule_item. Fatter than
# ScheduleItemSerializer -- it carries the entry itself and, for a bundle, the
# members it would break into -- so a whole day renders without a second round
# trip. `entry` and `members` are EntrySerializer.summary, the one EntrySummary
# shape the API sends everywhere.
#
# Like EntrySerializer this is bulk-first: `.list` loads every entry and every
# bundle's children in a fixed number of queries. `context_for` is public so a
# caller serializing several versions at once (TripDaySerializer) can build one
# context for all of them instead of one per version.
class ItineraryItemSerializer
  class << self
    def list(items, context: nil)
      items = Array(items)
      return [] if items.empty?

      context ||= context_for(items)
      items.map { |item| render(item, context) }
    end

    def one(item, context: nil)
      list([item], context: context).first
    end

    def context_for(items)
      items = Array(items)
      entries = Entry.where(id: items.filter_map(&:entry_id)).index_by(&:id)
      bundle_ids = entries.each_value.select(&:bundle?).map(&:id)
      links = bundle_ids.empty? ? [] : EntryLink.where(parent_id: bundle_ids).order(:position, :id).to_a
      children = Entry.where(id: links.map(&:child_id)).index_by(&:id)

      # Only a plan can have timed members, so only the items placing one are
      # asked. One query for the whole list, then item -> entry -> row.
      bundle_item_ids = items.select { |item| bundle_ids.include?(item.entry_id) }.map(&:id)
      times = bundle_item_ids.empty? ? [] : ScheduleItemMemberTime.where(schedule_item_id: bundle_item_ids).to_a

      {
        entries: entries,
        members: links.group_by(&:parent_id).transform_values { |ls| ls.filter_map { |l| children[l.child_id] } },
        member_times: times.group_by(&:schedule_item_id).transform_values { |ts| ts.index_by(&:entry_id) }
      }
    end

    private

    def render(item, context)
      entry = context[:entries][item.entry_id]
      # Members only for a bundle -- a plain idea breaks into nothing.
      members = entry&.bundle? ? Array(context[:members][entry.id]) : []
      times = context[:member_times][item.id] || {}

      {
        "id" => item.id,
        "trip_id" => item.trip_id,
        "entry_id" => item.entry_id,
        "chosen_entry_id" => item.chosen_entry_id,
        "day" => item.day&.iso8601,
        "day_version_id" => item.day_version_id,
        "starts_at_minutes" => item.starts_at_minutes,
        "ends_at_minutes" => item.ends_at_minutes,
        "note" => item.note,
        "position" => item.position,
        "entry" => EntrySerializer.summary(entry),
        "members" => members.map { |m| EntrySerializer.summary(m) },
        # The hours members were given on this placement, in the same order as
        # `members` and only for those someone timed -- sparse, like the table.
        # Always present: [] is "nobody timed anything", not "no such key".
        "member_times" => members.filter_map { |m| times[m.id] }.map do |t|
          { "entry_id" => t.entry_id, "starts_at_minutes" => t.starts_at_minutes, "ends_at_minutes" => t.ends_at_minutes }
        end
      }
    end
  end
end
