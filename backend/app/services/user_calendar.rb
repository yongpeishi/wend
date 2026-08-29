class UserCalendar
  def initialize(user)
    @user = user
  end

  def to_ical
    lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Wend//Itineraries//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      property("X-WR-CALNAME", "#{@user.name}'s Wend itineraries")
    ]
    schedule_items.each { |item| lines.concat(event_lines(item)) }
    lines << "END:VCALENDAR"
    "#{lines.join("\r\n")}\r\n"
  end

  private

  def schedule_items
    trip_ids = @user.trip_memberships.select(:trip_id)
    ScheduleItem.where(trip_id: Entry.active.where(id: trip_ids).select(:id))
                .in_final_plan
                .includes(:entry, :chosen_entry)
                .order(:day, :starts_at_minutes, :position, :id)
  end

  def event_lines(item)
    entry = item.chosen_entry || item.entry
    return [] if entry.nil?

    [
      "BEGIN:VEVENT",
      "UID:schedule-item-#{item.id}@wend",
      "DTSTAMP:#{item.updated_at.utc.strftime("%Y%m%dT%H%M%SZ")}",
      "DTSTART:#{local_time(item.day, item.starts_at_minutes)}",
      "DTEND:#{local_time(item.day, item.ends_at_minutes)}",
      property("SUMMARY", entry.title),
      property("DESCRIPTION", entry.description),
      property("LOCATION", entry.address),
      geo_property(entry),
      "END:VEVENT"
    ].compact
  end

  def local_time(day, minutes)
    minutes ||= 0
    day.strftime("%Y%m%d") + format("T%02d%02d00", minutes / 60, minutes % 60)
  end

  def property(name, value)
    return if value.blank?

    "#{name}:#{escape(value)}"
  end

  def geo_property(entry)
    return if entry.lat.nil? || entry.lng.nil?

    "GEO:#{entry.lat.to_f};#{entry.lng.to_f}"
  end

  def escape(value)
    value.to_s.gsub("\\", "\\\\")
         .gsub("\r\n", "\\n")
         .gsub(/[\r\n]/, "\\n")
         .gsub(",", "\\,")
         .gsub(";", "\\;")
  end
end