# "Delete for good" -- the only place in the product that destroys an Entry row.
#
# Preview and destroy are deliberately the same object over the same walk. The
# confirmation modal is built entirely from #preview's counts, and the whole
# reason this is one class rather than a controller branch plus a query object is
# that a preview computed separately from the destroy is a preview that can lie.
# Ask for the counts and then #destroy!, and the numbers the user agreed to are
# by construction the rows that go.
#
# It answers three questions about the subtree, and the split between them is the
# feature:
#
#   destroyed     -- descendants whose only parent chain ran through the target,
#                    and which this actor could have destroyed one at a time.
#   surviving     -- descendants also reachable from another trip or from the
#                    library. Untouched: an idea in two trips is ONE row in both,
#                    so deleting one trip must not take it out of the other.
#   left behind   -- sole-children this actor may not destroy. Left alive rather
#                    than blocking the whole operation; with no parent left they
#                    fall back into the actor's library, where their own creator
#                    can still reach them.
#
# Callers must have authorized the target already (EntryPolicy#destroy_permanently?)
# and must have checked that it is archived. This object enforces neither: it is
# the mechanism, and the controller is the gate.
class EntryPermanentDeletion
  attr_reader :entry, :user

  def initialize(entry, user)
    @entry = entry
    @user = user
  end

  # Exactly the wire shape the client's modal reads. String keys, because this
  # goes straight into `render json:` beside the refusal code.
  def preview
    {
      "title" => entry.title,
      "kind" => entry.kind,
      # What goes, not what exists: counted over the target plus the descendants
      # actually being destroyed, so a survivor's votes are not mourned.
      "votes_count" => Vote.where(entry_id: doomed_ids).count,
      "todos_count" => todos_count,
      "trip_titles" => trip_titles,
      "descendants_destroyed_count" => destroyable_ids.size,
      "descendants_surviving_count" => surviving_ids.size,
      "descendants_left_behind_count" => left_behind_ids.size
    }
  end

  # Returns the number of descendants destroyed -- the same integer #preview
  # reported as descendants_destroyed_count, off the same memoized walk.
  def destroy!
    count = destroyable_ids.size

    ActiveRecord::Base.transaction do
      # Written first, inside the transaction: the audit row and the destroy
      # commit together or not at all.
      EntryDeletion.create!(
        user_id: user&.id, entry_id: entry.id, kind: entry.kind, title: entry.title,
        descendants_destroyed: count, deleted_at: Time.current
      )

      # Row by row rather than delete_all, because every cascade this feature
      # depends on lives in Entry's `dependent:` declarations -- votes, todos,
      # placements, the nullified leg ends -- and delete_all fires none of them.
      # Descendants first, so the target's links are already thinned out by the
      # time it goes.
      Entry.where(id: destroyable_ids).find_each(&:destroy!)
      entry.destroy!
    end

    count
  end

  private

  # The target plus everything going with it: the id set every count above is
  # taken over.
  def doomed_ids
    @doomed_ids ||= [ entry.id ] + destroyable_ids
  end

  # A todo hangs off an entry, a trip, or both (Todo#governing_entry_ids), so both
  # routes have to be counted -- as one OR'd query rather than two additions, or a
  # todo attached to a doomed entry inside a doomed trip would be counted twice.
  def todos_count
    Todo.where(entry_id: doomed_ids).or(Todo.where(trip_id: doomed_ids)).count
  end

  # The trips this thing is in, by name, so the modal can say "it goes from there
  # as well". Filtered through the visibility scope and not merely plucked: an
  # idea can sit under a trip the caller has no grant on, and naming that trip --
  # even only its title -- would leak it.
  #
  # [] for a trip itself (it is not inside anything) and for a library entry
  # (there is no trip to name).
  def trip_titles
    return [] if entry.trip?

    Entry.visible_to(user)
         .where(id: Entry.ancestor_ids_of(entry.id), kind: "trip")
         .order(:id).pluck(:title)
  end

  def subtree_ids
    @subtree_ids ||= Entry.descendant_ids_of(entry.id).map(&:to_i)
  end

  # Which descendants have a parent chain that does not pass through the target.
  #
  # A downward reachability pass rather than one clever recursive CTE, because
  # the property is a fixed point and this is the shape that is easy to prove:
  #
  #   seed      -- a descendant with a parent that is neither the target nor
  #                inside the subtree. That parent is untouched, so the child
  #                stays where it is.
  #   propagate -- anything hanging under a survivor is itself a survivor, however
  #                deep. Its chain reaches the same outside anchor.
  #
  # Everything in the subtree that this never reaches is a sole-child: once the
  # target goes, nothing outside the deletion still points at it.
  def surviving_ids
    @surviving_ids ||= compute_surviving_ids
  end

  def compute_surviving_ids
    return [] if subtree_ids.empty?

    inside = subtree_ids.to_set
    # Only links whose CHILD is in the subtree matter. One query, no per-row walk.
    links = EntryLink.where(child_id: subtree_ids).pluck(:parent_id, :child_id)
    children_of = links.group_by(&:first).transform_values { |pairs| pairs.map(&:last) }

    frontier = links.reject { |parent_id, _child_id| parent_id == entry.id || inside.include?(parent_id) }
                    .map(&:last).uniq
    surviving = frontier.to_set

    until frontier.empty?
      frontier = frontier.flat_map { |id| children_of[id] || [] }.uniq.reject { |id| surviving.include?(id) }
      surviving.merge(frontier)
    end

    surviving.to_a
  end

  # Descendants that live nowhere else. Some of them this actor may not destroy;
  # #destroyable_ids is what is left after that filter.
  def sole_child_ids
    @sole_child_ids ||= subtree_ids - surviving_ids
  end

  # The cascade filter, and the reason "the creator may delete their own work" is
  # safe to ship: a member deleting their own idea must not sweep away a
  # sub-idea a co-traveller wrote, on authority they never had over it. So the
  # cascade destroys only what the actor could have destroyed one at a time.
  #
  # One policy object per candidate, each of which walks that candidate's
  # ancestors. A subtree small enough for a person to have built by hand is small
  # enough for that; correctness here is worth more than the query count, and
  # this runs at most twice per deletion (once for the preview, once for the
  # confirmed destroy).
  def destroyable_ids
    @destroyable_ids ||= Entry.where(id: sole_child_ids)
                              .select { |candidate| EntryPolicy.new(user, candidate).destroy_permanently? }
                              .map(&:id)
  end

  def left_behind_ids
    @left_behind_ids ||= sole_child_ids - destroyable_ids
  end
end
