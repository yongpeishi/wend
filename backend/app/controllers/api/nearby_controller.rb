module Api
  class NearbyController < Api::BaseController
    # Haversine distance computed in SQL. This SQLite build exposes sqrt/sin/
    # cos/asin/radians/power (verified with `SELECT sqrt(4.0)` etc against the
    # sqlite3 gem's bundled library), so the full formula runs as plain
    # arithmetic in one query -- no Ruby-side loop over candidate rows.
    # SQLite (at least the build behind the sqlite3 gem used here) rejects a
    # HAVING clause on a query with no GROUP BY / aggregate, even though the
    # HAVING predicate only reads a SELECT alias. Filtering on distance_km in
    # an outer WHERE (which can't see the inner alias either) needs the same
    # wrap, so the computed column is pushed into a subquery and filtered
    # from the outside.
    HAVERSINE_SQL = <<~SQL
      SELECT id, distance_km FROM (
        SELECT id,
          (6371 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(lat - :lat) / 2), 2) +
            COS(RADIANS(:lat)) * COS(RADIANS(lat)) * POWER(SIN(RADIANS(lng - :lng) / 2), 2)
          ))) AS distance_km
        FROM entries
        WHERE id IN (:entry_ids) AND lat IS NOT NULL AND lng IS NOT NULL AND archived_at IS NULL
      ) candidates
      WHERE distance_km <= :radius_km
      ORDER BY distance_km ASC
    SQL

    def index
      trip = Entry.find(params[:trip_id])
      lat = params[:lat].to_f
      lng = params[:lng].to_f
      radius_km = (params[:radius_km] || 2).to_f
      exclude_scheduled = ActiveModel::Type::Boolean.new.cast(params[:exclude_scheduled])

      entry_ids = Entry.descendant_ids_of(trip.id)

      distances = {}
      if entry_ids.present?
        sql = ActiveRecord::Base.sanitize_sql_array(
          [HAVERSINE_SQL, lat: lat, lng: lng, radius_km: radius_km, entry_ids: entry_ids]
        )
        ActiveRecord::Base.connection.select_all(sql).each do |row|
          distances[row["id"].to_i] = row["distance_km"].round(3)
        end
      end

      if exclude_scheduled && distances.present?
        scheduled_ids = ScheduleItem.where(trip_id: trip.id)
                                     .where("entry_id IN (:ids) OR chosen_entry_id IN (:ids)", ids: distances.keys)
                                     .pluck(:entry_id, :chosen_entry_id).flatten.compact.to_set
        distances = distances.reject { |id, _| scheduled_ids.include?(id) }
      end

      entries_by_id = Entry.where(id: distances.keys).index_by(&:id)
      results = distances.keys.map do |id|
        EntrySerializer.one_with_distance(entries_by_id[id], distances[id], current_user: current_user, trip_id: trip.id)
      end

      render json: { entries: results }
    end
  end
end
