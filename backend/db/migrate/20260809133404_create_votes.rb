class CreateVotes < ActiveRecord::Migration[8.1]
  def change
    create_table :votes do |t|
      t.references :entry, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.integer :score, null: false

      t.timestamps
    end

    add_index :votes, [:entry_id, :user_id], unique: true
  end
end
