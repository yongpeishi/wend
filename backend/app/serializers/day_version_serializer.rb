class DayVersionSerializer
  class << self
    def list(versions, context: nil)
      versions = Array(versions)
      return [] if versions.empty?

      context ||= ItineraryItemSerializer.context_for(versions.flat_map { |v| v.schedule_items.to_a })
      versions.map { |version| one(version, context: context) }
    end

    def one(version, context: nil)
      items = version.schedule_items.to_a

      {
        "id" => version.id,
        "trip_day_id" => version.trip_day_id,
        "name" => version.name,
        "position" => version.position,
        "archived_at" => version.archived_at&.iso8601,
        "schedule_items" => ItineraryItemSerializer.list(items, context: context)
      }
    end
  end
end
