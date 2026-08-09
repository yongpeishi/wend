class CreateFeedbacks < ActiveRecord::Migration[8.1]
  def change
    create_table :feedbacks do |t|
      t.text :message, null: false
      t.references :user, null: false, foreign_key: true

      # Where the user was standing when they spoke up. `path` is the client
      # route (e.g. "/trips/3/schedule"), not a server route.
      t.string :path

      # The optional "point at the thing I mean" capture. Both are nullable --
      # most feedback is about the app in general, not one element.
      t.string :element_selector
      t.string :element_label

      t.string :status, null: false, default: "new"
      t.string :user_agent

      t.timestamps
    end

    add_index :feedbacks, :status
    add_index :feedbacks, :created_at
  end
end
