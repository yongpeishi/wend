# `triaged` named the act of reading a note rather than the outcome of reading
# it, so it collected everything an admin had ever opened and never emptied.
# `rejected` is the outcome it was standing in for: read, and not being acted
# on. See Feedback::STATUSES.
#
# Written in SQL rather than through the model, because the model's inclusion
# validation no longer accepts the value this is migrating away from.
class RenameTriagedFeedbackStatusToRejected < ActiveRecord::Migration[8.1]
  def up
    execute "UPDATE feedbacks SET status = 'rejected' WHERE status = 'triaged'"
  end

  def down
    execute "UPDATE feedbacks SET status = 'triaged' WHERE status = 'rejected'"
  end
end
