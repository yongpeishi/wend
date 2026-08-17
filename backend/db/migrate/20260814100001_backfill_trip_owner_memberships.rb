# Written in SQL rather than through the model, so it keeps working after
# TripMembership's validations change.
class BackfillTripOwnerMemberships < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      INSERT INTO trip_memberships (trip_id, user_id, role, created_at, updated_at)
      SELECT e.id, e.created_by_id, 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM entries e
       WHERE e.kind = 'trip'
         AND e.created_by_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM trip_memberships m
            WHERE m.trip_id = e.id AND m.user_id = e.created_by_id
         )
    SQL

    orphans = select_value("SELECT COUNT(*) FROM entries WHERE kind = 'trip' AND created_by_id IS NULL")
    say "WARNING: #{orphans} trip(s) have no created_by and now have no owner" if orphans.to_i.positive?
  end

  def down
    execute "DELETE FROM trip_memberships WHERE role = 'owner'"
  end
end
