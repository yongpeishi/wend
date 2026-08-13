# A whole day, versions and all. Every itinerary mutation answers with one of
# these so the client can replace a single day in its cache without a refetch
# race.
#
# `.list` builds one ItineraryItemSerializer context across every version of
# every day, so a trip's whole itinerary costs a fixed handful of queries
# instead of a few per version. Pass materialized arrays, and prefer
# `includes(:lodging_entry, day_versions: :schedule_items)` on the query.
class TripDaySerializer
  class << self
    def list(trip_days)
      trip_days = Array(trip_days)
      return [] if trip_days.empty?

      versions = trip_days.flat_map { |td| td.day_versions.to_a }
      context = ItineraryItemSerializer.context_for(versions.flat_map { |v| v.schedule_items.to_a })
      trip_days.map { |trip_day| one(trip_day, context: context) }
    end

    def one(trip_day, context: nil)
      versions = trip_day.day_versions.to_a
      context ||= ItineraryItemSerializer.context_for(versions.flat_map { |v| v.schedule_items.to_a })

      {
        "id" => trip_day.id,
        "trip_id" => trip_day.trip_id,
        "day" => trip_day.day&.iso8601,
        "lodging_entry_id" => trip_day.lodging_entry_id,
        "lodging_label" => trip_day.lodging_label,
        # Resolved for the client: the kept place's title wins, then the free
        # text, then nothing.
        "lodging_title" => trip_day.lodging_title,
        "versions" => DayVersionSerializer.list(live(versions), context: context),
        "archived_versions" => DayVersionSerializer.list(archived(versions), context: context)
      }
    end

    private

    # Sorted in Ruby rather than SQL so a preloaded association is used as-is.
    def live(versions)
      versions.reject(&:archived?).sort_by { |v| [v.position, v.id] }
    end

    def archived(versions)
      versions.select(&:archived?).sort_by { |v| [-v.archived_at.to_i, -v.id] }
    end
  end
end
