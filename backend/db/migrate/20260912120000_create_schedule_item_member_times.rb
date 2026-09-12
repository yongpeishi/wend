# The hours of one member of a plan (a bundle entry) on one placement of that
# plan. Sparse: a row exists only for a member someone actually timed, so the
# common plan costs nothing here and there is nothing to backfill.
#
# Hangs off the schedule_item, not the entry_link, on purpose: a plan placed on
# two days, or on two versions of one day, gets its own hours each time. Same
# placement-vs-kept split as schedule_items themselves, one level down -- see
# doc/architecture.md section 2.
class CreateScheduleItemMemberTimes < ActiveRecord::Migration[8.1]
  def change
    create_table :schedule_item_member_times do |t|
      # index: false -- the unique pair below already leads on schedule_item_id.
      t.references :schedule_item, null: false, foreign_key: true, index: false
      t.references :entry, null: false, foreign_key: { to_table: :entries }
      t.integer :starts_at_minutes
      t.integer :ends_at_minutes

      t.timestamps
    end

    add_index :schedule_item_member_times, [:schedule_item_id, :entry_id], unique: true
  end
end
