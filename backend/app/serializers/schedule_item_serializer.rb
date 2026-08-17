class ScheduleItemSerializer
  class << self
    def list(items)
      Array(items).map { |i| one(i) }
    end

    def one(item)
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
        "created_at" => item.created_at.iso8601,
        "updated_at" => item.updated_at.iso8601
      }
    end
  end
end
