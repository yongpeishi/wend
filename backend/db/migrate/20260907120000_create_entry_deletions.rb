class CreateEntryDeletions < ActiveRecord::Migration[8.1]
  def change
    create_table :entry_deletions do |t|
      # Who did it. A real FK: the person survives the thing they deleted.
      t.references :user, null: false, foreign_key: true
      # Deliberately NOT a foreign key, and deliberately not a t.references: the
      # entry is gone by the time this row is committed, so a constraint here
      # would reject the only row that matters. The id is kept as a bare integer
      # for correlating with anything else that logged it.
      t.integer :entry_id, null: false
      # Copied off the row rather than joined to it, for the same reason: after
      # the destroy there is nothing left to read a title from, and "where did my
      # trip go?" is answerable only if the answer was written down here.
      t.string :kind, null: false
      t.string :title, null: false
      t.integer :descendants_destroyed, null: false, default: 0
      # No t.timestamps. The row is append-only and records one instant, so a
      # created_at that could drift from it would be a second source of truth.
      t.datetime :deleted_at, null: false
    end
  end
end
