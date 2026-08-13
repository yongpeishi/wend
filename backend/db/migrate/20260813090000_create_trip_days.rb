# One row per date a trip has actually put something on. Days with nothing on
# them have no row -- the client merges the trip's date range with what comes
# back. `lodging_entry_id` points at a kept place; `lodging_label` is the free
# text escape hatch ("Sleeping on the plane"). They are mutually exclusive in
# practice but not enforced: the serializer sends both and the client prefers
# the entry's title. See doc/architecture.md section 2.
class CreateTripDays < ActiveRecord::Migration[8.1]
  def change
    create_table :trip_days do |t|
      t.references :trip, null: false, foreign_key: { to_table: :entries }
      t.date :day, null: false
      t.references :lodging_entry, foreign_key: { to_table: :entries }
      t.string :lodging_label

      t.timestamps
    end

    add_index :trip_days, [:trip_id, :day], unique: true
  end
end
