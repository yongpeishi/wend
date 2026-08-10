class CreateEntries < ActiveRecord::Migration[8.1]
  def change
    create_table :entries do |t|
      t.string :kind, null: false
      t.string :title, null: false
      t.text :description
      t.string :category
      t.date :starts_on
      t.date :ends_on
      t.string :location_name
      t.string :address
      t.decimal :lat, precision: 10, scale: 6
      t.decimal :lng, precision: 10, scale: 6
      t.integer :duration_minutes
      t.string :source_url
      t.text :notes
      t.references :from_entry, foreign_key: { to_table: :entries }
      t.references :to_entry, foreign_key: { to_table: :entries }
      t.references :created_by, null: false, foreign_key: { to_table: :users }
      t.datetime :archived_at

      t.timestamps
    end

    add_index :entries, :kind
    add_index :entries, :category
    add_index :entries, :archived_at
    add_index :entries, [:lat, :lng]
  end
end
