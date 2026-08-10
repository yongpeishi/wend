class CreateFeedbacks < ActiveRecord::Migration[8.1]
  def change
    create_table :feedbacks do |t|
      t.text :message, null: false
      t.references :user, null: false, foreign_key: true

      # Where the user was standing when they spoke up: the full client URL
      # (e.g. "http://localhost:5173/trips/3/schedule"), not a server route.
      t.string :url

      # The optional "point at the thing I mean" capture. Both are nullable --
      # most feedback is about the app in general, not one element.
      #
      # `element_classes` is the element's raw class attribute, kept as a
      # reference for whoever reads the report -- never as text a user wrote.
      t.string :element_selector
      t.string :element_classes

      t.string :status, null: false, default: "new"
      t.string :user_agent

      t.timestamps
    end

    add_index :feedbacks, :status
    add_index :feedbacks, :created_at
  end
end
