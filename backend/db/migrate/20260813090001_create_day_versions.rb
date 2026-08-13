# Alternate plans for the same day, side by side. `archived_at` means "not
# chosen, kept anyway" -- nothing here is ever destroyed, exactly as with
# entries (doc/architecture.md section 2). A day always keeps at least one live
# version.
class CreateDayVersions < ActiveRecord::Migration[8.1]
  def change
    create_table :day_versions do |t|
      t.references :trip_day, null: false, foreign_key: true
      t.string :name, null: false
      t.integer :position, null: false, default: 0
      t.datetime :archived_at

      t.timestamps
    end

    add_index :day_versions, [:trip_day_id, :position]
    add_index :day_versions, :archived_at
  end
end
