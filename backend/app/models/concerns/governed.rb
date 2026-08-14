# Every non-Entry row in this app hangs off an Entry, so the permission rule is
# written once and each model names the entries that speak for it.
#
# The set is a **conjunction** -- every named entry must be permitted, so a
# schedule item in a trip you cannot see is not readable merely because it points
# at an idea you can see through some other trip.
module Governed
  extend ActiveSupport::Concern

  def governing_entry_ids
    raise NotImplementedError
  end
end
