# Hangs every scheduled item off a day_version instead of a bare date.
#
# The column stays nullable on purpose: the older final-schedule screen POSTs
# `day` with no version, and a null there must not 500 it. The controller
# resolves the missing version at write time, so after this migration no live
# row is left without one.
class AddDayVersionToScheduleItems < ActiveRecord::Migration[8.1]
  def up
    add_reference :schedule_items, :day_version, foreign_key: true
    backfill!
  end

  def down
    remove_reference :schedule_items, :day_version, foreign_key: true
  end

  # Every distinct (trip_id, day) that already has items gets a trip_day and a
  # single "Version A" holding all of them. Kept public and separate from `up`
  # so the test suite can exercise it directly against real rows.
  #
  # Written against the tables rather than the models: a migration must keep
  # working when the models move on underneath it.
  def backfill!
    pairs = select_rows(<<~SQL.squish)
      SELECT DISTINCT trip_id, day FROM schedule_items WHERE day_version_id IS NULL
    SQL

    pairs.each do |trip_id, day|
      trip_day_id = find_or_create_trip_day(trip_id, day)
      version_id = find_or_create_first_version(trip_day_id)
      execute(sanitize(<<~SQL.squish, trip_id: trip_id, day: day, version_id: version_id))
        UPDATE schedule_items SET day_version_id = :version_id, updated_at = CURRENT_TIMESTAMP
        WHERE trip_id = :trip_id AND day = :day AND day_version_id IS NULL
      SQL
    end
  end

  private

  def find_or_create_trip_day(trip_id, day)
    existing = select_value(sanitize("SELECT id FROM trip_days WHERE trip_id = :trip_id AND day = :day",
                                     trip_id: trip_id, day: day))
    return existing if existing

    execute(sanitize(<<~SQL.squish, trip_id: trip_id, day: day))
      INSERT INTO trip_days (trip_id, day, created_at, updated_at)
      VALUES (:trip_id, :day, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    SQL
    select_value(sanitize("SELECT id FROM trip_days WHERE trip_id = :trip_id AND day = :day",
                          trip_id: trip_id, day: day))
  end

  def find_or_create_first_version(trip_day_id)
    existing = select_value(sanitize(<<~SQL.squish, trip_day_id: trip_day_id))
      SELECT id FROM day_versions WHERE trip_day_id = :trip_day_id AND archived_at IS NULL
      ORDER BY position, id LIMIT 1
    SQL
    return existing if existing

    execute(sanitize(<<~SQL.squish, trip_day_id: trip_day_id))
      INSERT INTO day_versions (trip_day_id, name, position, created_at, updated_at)
      VALUES (:trip_day_id, 'Version A', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    SQL
    select_value(sanitize("SELECT id FROM day_versions WHERE trip_day_id = :trip_day_id ORDER BY id DESC LIMIT 1",
                          trip_day_id: trip_day_id))
  end

  def sanitize(sql, **binds)
    ActiveRecord::Base.sanitize_sql_array([sql, binds])
  end
end
