class CreateEntryLinks < ActiveRecord::Migration[8.1]
  def change
    create_table :entry_links do |t|
      t.references :parent, null: false, foreign_key: { to_table: :entries }
      t.references :child, null: false, foreign_key: { to_table: :entries }
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    # t.references above already creates an index on child_id (and parent_id),
    # satisfying "index on child_id" from the contract.
    add_index :entry_links, [:parent_id, :child_id], unique: true
  end
end
