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
    "#{lines.compact.flat_map { |line| fold(line) }.join("\r\n")}\r\n"
  end

  private

  def schedule_items
    trip_ids = @user.trip_memberships.select(:trip_id)
    ScheduleItem.where(trip_id: Entry.active.where(id: trip_ids).select(:id))
                .in_final_plan
                .includes(entry: { child_links: :child })
                .order(:day, :starts_at_minutes, :position, :id)
  end

  def event_lines(item)
    entries_with_times(item).flat_map do |entry, starts_at, ends_at|
      lines_for_event(item, entry, starts_at, ends_at)
    end
  end

  # A bundle placed on an itinerary commits all of its members to that plan.
  # Bundles which remain only on the board never have a ScheduleItem and never
  # reach this method. The member spans follow the itinerary UI: proportional
  # to estimates when every member has one, otherwise divided evenly.
  def entries_with_times(item)
    entry = item.entry
    return [] if entry.nil?
    return [ [ entry, item.starts_at_minutes, item.ends_at_minutes ] ] unless entry.bundle?

    members = entry.child_links.sort_by { |link| [ link.position, link.id ] }.map(&:child)
    return [] if members.empty?
    return members.map { |member| [ member, nil, nil ] } if item.starts_at_minutes.nil?

    ends_at = item.ends_at_minutes || item.starts_at_minutes + members.sum { |member| member.duration_minutes.to_i }
    weights = member_weights(members)
    total = weights.sum
    cursor = item.starts_at_minutes

    members.each_with_index.map do |member, index|
      finish = if index == members.length - 1
        ends_at
      else
        item.starts_at_minutes + ((ends_at - item.starts_at_minutes) * weights.first(index + 1).sum.to_f / total).round
      end
      span = [ member, cursor, finish ]
      cursor = finish
      span
    end
  end

  def member_weights(members)
    estimates = members.map(&:duration_minutes)
    estimates.all? { |minutes| minutes.present? && minutes.positive? } ? estimates : Array.new(members.length, 1)
  end

  def lines_for_event(item, entry, starts_at, ends_at)
    [
      "BEGIN:VEVENT",
      "UID:schedule-item-#{item.id}-entry-#{entry.id}@wend",
      "DTSTAMP:#{item.updated_at.utc.strftime("%Y%m%dT%H%M%SZ")}",
      *time_properties(item.day, starts_at, ends_at, entry),
      property("SUMMARY", entry.title),
      property("DESCRIPTION", entry.description),
      property("LOCATION", entry.address),
      geo_property(entry),
      "END:VEVENT"
    ].compact
  end

  def time_properties(day, starts_at, ends_at, entry)
    if starts_at.nil?
      return [
        "DTSTART;VALUE=DATE:#{day.strftime("%Y%m%d")}",
        "DTEND;VALUE=DATE:#{(day + 1).strftime("%Y%m%d")}"
      ]
    end

    ends_at ||= starts_at + entry.duration_minutes.to_i
    [
      "DTSTART:#{local_time(day, starts_at)}",
      "DTEND:#{local_time(day, ends_at)}"
    ]
  end

  def local_time(day, minutes)
    day += minutes / 1.day.in_minutes
    minutes %= 1.day.in_minutes
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

  # RFC 5545 caps content lines at 75 octets. Continuations begin with one
  # space, leaving 74 octets for their content; iterating characters keeps a
  # multi-byte place name from being split into invalid UTF-8.
  def fold(line)
    folded = []
    current = +""
    line.each_char do |character|
      if current.bytesize + character.bytesize > 75
        folded << current
        current = +" "
      end
      current << character
    end
    folded << current
  end
end
