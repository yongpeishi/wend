class CreateScheduleItems < ActiveRecord::Migration[8.1]
  def change
    create_table :schedule_items do |t|
      t.references :trip, null: false, foreign_key: { to_table: :entries }
      t.references :entry, foreign_key: { to_table: :entries }
      t.references :chosen_entry, foreign_key: { to_table: :entries }
      t.date :day, null: false
      t.integer :starts_at_minutes
      t.integer :ends_at_minutes
      t.text :note
      t.integer :position, default: 0

      t.timestamps
    end

    add_index :schedule_items, [:trip_id, :day]
  end
end
