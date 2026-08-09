# Plain PORO serializer (no heavyweight gem, per ADR). `.list` is the workhorse:
# it takes an array of Entry rows and serializes all of them with a fixed,
# small number of bulk queries for vote tallies / counts / scheduled status --
# never one query per entry. Always call `.list`/`.one` with a materialized
# array (`.to_a`), not a lazy relation, so the aggregate queries below and the
# N+1-avoidance they buy actually happen once.
class EntrySerializer
  class << self
    def list(entries, current_user: nil, trip_id: nil)
      entries = Array(entries)
      ids = entries.map(&:id)
      return [] if ids.empty?

      tallies = vote_tallies(ids)
      my_votes = current_user ? Vote.where(entry_id: ids, user_id: current_user.id).pluck(:entry_id, :score).to_h : {}
      children_counts = EntryLink.where(parent_id: ids).group(:parent_id).count
      open_todo_counts = Todo.where(entry_id: ids, done_at: nil).group(:entry_id).count
      scheduled_ids = scheduled_entry_ids(ids, trip_id: trip_id)

      entries.map do |entry|
        base(entry).merge(
          "children_count" => children_counts[entry.id] || 0,
          "todos_open_count" => open_todo_counts[entry.id] || 0,
          "vote_tally" => tallies[entry.id] || { "total" => 0, "count" => 0, "average" => 0.0 },
          "my_vote" => my_votes[entry.id],
          "scheduled" => scheduled_ids.include?(entry.id)
        )
      end
    end

    def one(entry, current_user: nil, trip_id: nil)
      list([entry], current_user: current_user, trip_id: trip_id).first
    end

    def one_with_distance(entry, distance_km, current_user: nil, trip_id: nil)
      one(entry, current_user: current_user, trip_id: trip_id).merge("distance_km" => distance_km)
    end

    def summary(entry)
      { "id" => entry.id, "kind" => entry.kind, "title" => entry.title, "category" => entry.category }
    end

    def detail(entry, current_user: nil)
      one(entry, current_user: current_user).merge(
        "parents" => entry.parents.map { |p| summary(p) },
        "children" => list(entry.children.to_a, current_user: current_user),
        "todos" => TodoSerializer.list(entry.todos.order(:position).to_a),
        "votes" => entry.votes.to_a.map { |v| VoteSerializer.one(v) }
      )
    end

    private

    def base(entry)
      {
        "id" => entry.id,
        "kind" => entry.kind,
        "title" => entry.title,
        "description" => entry.description,
        "category" => entry.category,
        "starts_on" => entry.starts_on&.iso8601,
        "ends_on" => entry.ends_on&.iso8601,
        "location_name" => entry.location_name,
        "address" => entry.address,
        "lat" => entry.lat.nil? ? nil : entry.lat.to_f,
        "lng" => entry.lng.nil? ? nil : entry.lng.to_f,
        "duration_minutes" => entry.duration_minutes,
        "source_url" => entry.source_url,
        "notes" => entry.notes,
        "from_entry_id" => entry.from_entry_id,
        "to_entry_id" => entry.to_entry_id,
        "archived_at" => entry.archived_at&.iso8601,
        "created_at" => entry.created_at.iso8601,
        "updated_at" => entry.updated_at.iso8601
      }
    end

    def vote_tallies(ids)
      rows = Vote.where(entry_id: ids).group(:entry_id).pluck(:entry_id, Arel.sql("SUM(score)"), Arel.sql("COUNT(*)"))
      rows.each_with_object({}) do |(entry_id, total, count), hash|
        total = total.to_i
        count = count.to_i
        hash[entry_id] = {
          "total" => total,
          "count" => count,
          "average" => count.zero? ? 0.0 : (total.to_f / count).round(2)
        }
      end
    end

    # An entry is "scheduled" if a schedule_item references it directly
    # (entry_id) or as the chosen member of a bundle (chosen_entry_id).
    # When `trip_id` is given, only schedule_items in that trip count.
    def scheduled_entry_ids(ids, trip_id: nil)
      scope = ScheduleItem.where("entry_id IN (:ids) OR chosen_entry_id IN (:ids)", ids: ids)
      scope = scope.where(trip_id: trip_id) if trip_id
      scope.pluck(:entry_id, :chosen_entry_id).flatten.compact.to_set
    end
  end
end
