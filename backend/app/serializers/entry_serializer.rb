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
      # One bulk query like every other line above, never one per row. Only trips
      # have a role of their own; ideas and bundles inherit their trip's, which the
      # client already holds.
      roles = current_user ? TripMembership.where(user_id: current_user.id, trip_id: ids).pluck(:trip_id, :role).to_h : {}

      entries.map do |entry|
        base(entry).merge(
          "children_count" => children_counts[entry.id] || 0,
          "todos_open_count" => open_todo_counts[entry.id] || 0,
          "vote_tally" => tallies[entry.id] || { "total" => 0, "count" => 0, "average" => 0.0, "voters" => [] },
          "my_vote" => my_votes[entry.id],
          "scheduled" => scheduled_ids.include?(entry.id),
          "my_role" => entry.kind == "trip" ? roles[entry.id] : nil
        )
      end
    end

    def one(entry, current_user: nil, trip_id: nil)
      list([entry], current_user: current_user, trip_id: trip_id).first
    end

    def one_with_distance(entry, distance_km, current_user: nil, trip_id: nil)
      one(entry, current_user: current_user, trip_id: trip_id).merge("distance_km" => distance_km)
    end

    # The one EntrySummary shape in the API: entry `parents`, `Todo#entry`, and
    # the itinerary's `entry`/`members` all send exactly this. `duration_minutes`
    # and `location_name` are here for the itinerary, which sizes a day from
    # them, but they cost nothing on the row and one shared shape beats two
    # near-identical ones.
    def summary(entry)
      return nil if entry.nil?

      {
        "id" => entry.id,
        "kind" => entry.kind,
        "title" => entry.title,
        "category" => entry.category,
        "duration_minutes" => entry.duration_minutes,
        "location_name" => entry.location_name
      }
    end

    # parents and children go through the visibility scope, not the raw
    # association. An idea can sit in two trips at once, and naming the other one --
    # even only its title -- tells the caller about a trip they may not see. The
    # same is true downwards for a library idea somebody else has hung something
    # under.
    def detail(entry, current_user: nil)
      one(entry, current_user: current_user).merge(
        "parents" => visible(entry.parents, current_user).map { |p| summary(p) },
        "children" => list(visible(entry.children, current_user).to_a, current_user: current_user),
        "todos" => TodoSerializer.list(entry.todos.order(:position).to_a),
        "votes" => entry.votes.includes(:user).map { |v| VoteSerializer.one(v) },
        "collaborators_count" => collaborators_count(entry)
      )
    end

    private

    def visible(relation, current_user)
      current_user ? relation.visible_to(current_user) : relation.none
    end

    # The people on the trip this entry belongs to, so an idea reports the trip it
    # sits in rather than a count of its own. Distinct users, because an idea can
    # sit in two trips and the same person can be on both. 0 in the library, where
    # there is no trip and so nobody to be on it.
    def collaborators_count(entry)
      trip_ids = entry.kind == "trip" ? [ entry.id ] : Entry.ancestor_ids_of(entry.id).map(&:to_i)
      TripMembership.where(trip_id: trip_ids).distinct.count(:user_id)
    end

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
        # Always arrays -- Entry's readers coerce a legacy NULL to [].
        "pros" => entry.pros,
        "cons" => entry.cons,
        "from_entry_id" => entry.from_entry_id,
        "to_entry_id" => entry.to_entry_id,
        "archived_at" => entry.archived_at&.iso8601,
        "created_at" => entry.created_at.iso8601,
        "updated_at" => entry.updated_at.iso8601
      }
    end

    def vote_tallies(ids)
      rows = Vote.where(entry_id: ids).group(:entry_id).pluck(:entry_id, Arel.sql("SUM(score)"), Arel.sql("COUNT(*)"))
      voters = voters_by_entry(ids)
      rows.each_with_object({}) do |(entry_id, total, count), hash|
        total = total.to_i
        count = count.to_i
        hash[entry_id] = {
          "total" => total,
          "count" => count,
          "average" => count.zero? ? 0.0 : (total.to_f / count).round(2),
          "voters" => voters[entry_id] || []
        }
      end
    end

    # Who voted, not just how much: the idea list names the voters. One more bulk
    # query for the whole page, grouped in Ruby -- never `entry.votes` in a loop.
    # left_joins because a vote whose user row has gone missing must still show up:
    # dropping it would make voters.size disagree with the count above.
    def voters_by_entry(ids)
      Vote.where(entry_id: ids).left_joins(:user).order(:user_id)
          .pluck(:entry_id, :user_id, "users.name", :score)
          .group_by(&:first)
          .transform_values do |group|
            group.map { |(_entry_id, user_id, user_name, score)| { "user_id" => user_id, "user_name" => user_name, "score" => score } }
          end
    end

    # An entry is "scheduled" if a schedule_item references it directly
    # (entry_id) or as the chosen member of a bundle (chosen_entry_id).
    # When `trip_id` is given, only schedule_items in that trip count.
    #
    # `placed` because an archived version is a plan the user rejected: an
    # entry left behind in one is back to potential everywhere (board, map,
    # library, unscheduled tray), matching the itinerary rail.
    def scheduled_entry_ids(ids, trip_id: nil)
      scope = ScheduleItem.placed.where("entry_id IN (:ids) OR chosen_entry_id IN (:ids)", ids: ids)
      scope = scope.where(trip_id: trip_id) if trip_id
      scope.pluck(:entry_id, :chosen_entry_id).flatten.compact.to_set
    end
  end
end
