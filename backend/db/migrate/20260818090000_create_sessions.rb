class CreateSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :sessions do |t|
      t.references :user, null: false, foreign_key: true
      # The bearer credential the signed cookie carries. Unique because lookup
      # is by token alone -- a collision would let one user's cookie resolve to
      # another user's session.
      t.string :token, null: false
      # Every session dies on its own even if sign-out never happens; a stolen
      # cookie is only good until this passes.
      t.datetime :expires_at, null: false

      t.timestamps
    end

    add_index :sessions, :token, unique: true
  end
end
