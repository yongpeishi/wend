# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_08_09_140000) do
  create_table "entries", force: :cascade do |t|
    t.string "address"
    t.datetime "archived_at"
    t.string "category"
    t.datetime "created_at", null: false
    t.integer "created_by_id", null: false
    t.text "description"
    t.integer "duration_minutes"
    t.date "ends_on"
    t.integer "from_entry_id"
    t.string "kind", null: false
    t.decimal "lat", precision: 10, scale: 6
    t.decimal "lng", precision: 10, scale: 6
    t.string "location_name"
    t.text "notes"
    t.string "source_url"
    t.date "starts_on"
    t.string "title", null: false
    t.integer "to_entry_id"
    t.datetime "updated_at", null: false
    t.index ["archived_at"], name: "index_entries_on_archived_at"
    t.index ["category"], name: "index_entries_on_category"
    t.index ["created_by_id"], name: "index_entries_on_created_by_id"
    t.index ["from_entry_id"], name: "index_entries_on_from_entry_id"
    t.index ["kind"], name: "index_entries_on_kind"
    t.index ["lat", "lng"], name: "index_entries_on_lat_and_lng"
    t.index ["to_entry_id"], name: "index_entries_on_to_entry_id"
  end

  create_table "entry_links", force: :cascade do |t|
    t.integer "child_id", null: false
    t.datetime "created_at", null: false
    t.integer "parent_id", null: false
    t.integer "position", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["child_id"], name: "index_entry_links_on_child_id"
    t.index ["parent_id", "child_id"], name: "index_entry_links_on_parent_id_and_child_id", unique: true
    t.index ["parent_id"], name: "index_entry_links_on_parent_id"
  end

  create_table "feedbacks", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "element_classes"
    t.string "element_selector"
    t.text "message", null: false
    t.string "status", default: "new", null: false
    t.datetime "updated_at", null: false
    t.string "url"
    t.string "user_agent"
    t.integer "user_id", null: false
    t.index ["created_at"], name: "index_feedbacks_on_created_at"
    t.index ["status"], name: "index_feedbacks_on_status"
    t.index ["user_id"], name: "index_feedbacks_on_user_id"
  end

  create_table "schedule_items", force: :cascade do |t|
    t.integer "chosen_entry_id"
    t.datetime "created_at", null: false
    t.date "day", null: false
    t.integer "ends_at_minutes"
    t.integer "entry_id"
    t.text "note"
    t.integer "position", default: 0
    t.integer "starts_at_minutes"
    t.integer "trip_id", null: false
    t.datetime "updated_at", null: false
    t.index ["chosen_entry_id"], name: "index_schedule_items_on_chosen_entry_id"
    t.index ["entry_id"], name: "index_schedule_items_on_entry_id"
    t.index ["trip_id", "day"], name: "index_schedule_items_on_trip_id_and_day"
    t.index ["trip_id"], name: "index_schedule_items_on_trip_id"
  end

  create_table "todos", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "done_at"
    t.date "due_on"
    t.integer "entry_id"
    t.integer "position", default: 0
    t.string "title", null: false
    t.integer "trip_id"
    t.datetime "updated_at", null: false
    t.index ["entry_id"], name: "index_todos_on_entry_id"
    t.index ["trip_id"], name: "index_todos_on_trip_id"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "name", null: false
    t.string "password_digest", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  create_table "votes", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "entry_id", null: false
    t.integer "score", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["entry_id", "user_id"], name: "index_votes_on_entry_id_and_user_id", unique: true
    t.index ["entry_id"], name: "index_votes_on_entry_id"
    t.index ["user_id"], name: "index_votes_on_user_id"
  end

  add_foreign_key "entries", "entries", column: "from_entry_id"
  add_foreign_key "entries", "entries", column: "to_entry_id"
  add_foreign_key "entries", "users", column: "created_by_id"
  add_foreign_key "entry_links", "entries", column: "child_id"
  add_foreign_key "entry_links", "entries", column: "parent_id"
  add_foreign_key "feedbacks", "users"
  add_foreign_key "schedule_items", "entries"
  add_foreign_key "schedule_items", "entries", column: "chosen_entry_id"
  add_foreign_key "schedule_items", "entries", column: "trip_id"
  add_foreign_key "todos", "entries"
  add_foreign_key "todos", "entries", column: "trip_id"
  add_foreign_key "votes", "entries"
  add_foreign_key "votes", "users"
end
