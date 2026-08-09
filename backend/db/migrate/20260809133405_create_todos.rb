class CreateTodos < ActiveRecord::Migration[8.1]
  def change
    create_table :todos do |t|
      t.string :title, null: false
      t.references :entry, foreign_key: { to_table: :entries }
      t.references :trip, foreign_key: { to_table: :entries }
      t.datetime :done_at
      t.date :due_on
      t.integer :position, default: 0

      t.timestamps
    end
  end
end
