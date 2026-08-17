class CreateTripMemberships < ActiveRecord::Migration[8.1]
  def change
    create_table :trip_memberships do |t|
      # trip_id is an entries FK, following todos.trip_id and schedule_items.trip_id:
      # "trip" is not a table, it is an Entry with kind: "trip".
      t.references :trip, null: false, foreign_key: { to_table: :entries }, index: false
      t.references :user, null: false, foreign_key: true, index: false
      t.string :role, null: false

      t.timestamps
    end

    # One role per person per trip. Its leading column also answers every
    # "who is on this trip" lookup, so the plain trip_id index t.references
    # would have added is redundant -- hence index: false above.
    add_index :trip_memberships, [ :trip_id, :user_id ], unique: true
    # The hot path runs the other way: "which trips can this user see", once on
    # nearly every request. A composite starting at user_id answers it from the
    # index alone.
    add_index :trip_memberships, [ :user_id, :role ]
    # Exactly one owner per trip.
    add_index :trip_memberships, :trip_id, unique: true, where: "role = 'owner'",
                                 name: "index_trip_memberships_one_owner_per_trip"
  end
end
