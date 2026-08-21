module Api
  class EntriesController < Api::BaseController
    before_action :set_entry, only: [:show, :update, :destroy, :restore, :tree, :lift, :absorb, :fork]

    def index
      trip_id = params[:trip_id].presence
      # Everything the caller may see, as an IN subquery -- every filter below chains
      # onto it unchanged, and none of them can widen it.
      scope = policy_scope(Entry)
      scope = scope.where(kind: params[:kind]) if params[:kind].present?
      scope = scope.where(category: params[:category]) if params[:category].present?

      if truthy?(params[:unassigned])
        scope = scope.library
      elsif trip_id
        scope = scope.where(id: Entry.descendant_ids_of(trip_id))
      end

      if params[:parent_id].present?
        child_ids = EntryLink.where(parent_id: params[:parent_id]).pluck(:child_id)
        scope = scope.where(id: child_ids)
      end

      if params[:q].present?
        term = "%#{params[:q]}%"
        scope = scope.where("title LIKE :term OR description LIKE :term", term: term)
      end

      scope = scope.active unless truthy?(params[:include_archived])

      entries = scope.order(:id).to_a

      if params[:scheduled].present? && trip_id
        want_scheduled = truthy?(params[:scheduled])
        # Only live placements count: an entry that survives nowhere but an
        # archived version is unplaced, which is exactly how the itinerary
        # screen treats it -- back on the rail.
        scheduled_ids = ScheduleItem.placed_entry_ids(trip_id: trip_id, among: entries.map(&:id))
        entries = entries.select { |e| scheduled_ids.include?(e.id) == want_scheduled }
      end

      render json: { entries: EntrySerializer.list(entries, current_user: current_user, trip_id: trip_id) }
    end

    def show
      detail = EntrySerializer.detail(@entry, current_user: current_user)
      render json: {
        entry: EntrySerializer.one(@entry, current_user: current_user),
        parents: detail["parents"],
        children: detail["children"],
        votes: detail["votes"],
        todos: detail["todos"],
        collaborators_count: detail["collaborators_count"]
      }
    end

    def create
      entry = Entry.new(entry_params)
      entry.created_by = current_user

      # A create can insert a node into anyone's trip, so the gate is the parent's
      # write rule, checked before anything is linked. With no parent this is a
      # library entry, which belongs to whoever makes it.
      parent = params[:parent_id].present? ? Entry.find(params[:parent_id]) : nil
      parent ? authorize(parent, :write?) : authorize(entry, :create?)

      ActiveRecord::Base.transaction do
        entry.save!
        if parent
          EntryLink.create!(parent_id: parent.id, child: entry, position: EntryLink.next_position_for(parent.id))
        end
      end

      render json: { entry: EntrySerializer.one(entry, current_user: current_user) }, status: :created
    end

    # Moving a trip's dates moves its plan with them: see TripDateShift. The
    # attempt is its own preview -- a change that would push planned days off
    # the end of the trip is refused with the list of them, and the client
    # re-sends with `confirm_dropped_days: true` once the user has said yes.
    def update
      shift = TripDateShift.for(@entry, entry_params)

      if shift.dropped_days? && !truthy?(params[:confirm_dropped_days])
        render json: {
          error: "dropped_days_need_confirmation",
          dropped_days: shift.dropped_days.map(&:iso8601),
          # Ideas coming back to the rail, not rows destroyed -- the warning
          # counts what the user gets back. The wire name is the older one the
          # client already reads; TripDateShift#dropped_entry_count says what
          # it is.
          dropped_item_count: shift.dropped_entry_count
        }, status: :unprocessable_entity
        return
      end

      ActiveRecord::Base.transaction do
        @entry.update!(entry_params)
        shift.apply!
      end

      render json: { entry: EntrySerializer.one(@entry, current_user: current_user) }
    end

    # Soft-hide only. Never destroys the row -- see doc/architecture.md "Never
    # hard-delete an Entry".
    def destroy
      @entry.archive!
      render json: { entry: EntrySerializer.one(@entry, current_user: current_user) }
    end

    def restore
      @entry.restore!
      render json: { entry: EntrySerializer.one(@entry, current_user: current_user) }
    end

    def tree
      depth = (params[:depth] || 3).to_i
      descendants = policy_scope(Entry).where(id: Entry.descendant_ids_of(@entry.id, depth_cap: depth)).to_a
      render json: {
        entry: EntrySerializer.one(@entry, current_user: current_user),
        descendants: EntrySerializer.list(descendants, current_user: current_user)
      }
    end

    # Convert an idea into its own trip, detached from its current parents.
    # Its children come along for free -- they're linked to this entry's id,
    # which does not change.
    def lift
      ActiveRecord::Base.transaction do
        @entry.parent_links.destroy_all
        # The lifter becomes the trip's owner: sync_owner_membership keys off the kind
        # transition and reads created_by, so this has to be set before the save.
        @entry.update!(kind: "trip", category: nil, created_by: current_user)
      end
      render json: { entry: EntrySerializer.one(@entry, current_user: current_user) }
    end

    # Fold this trip into another: it becomes an idea and gains the target as
    # a parent, keeping all of its own descendants.
    def absorb
      # Owner on both sides: absorbing puts one trip's whole tree inside another, so
      # being owner of only the trip being folded away is not enough. @entry's side is
      # checked by set_entry, via EntryPolicy#absorb?.
      into = Entry.find(params[:into_id])
      authorize into, :manage?
      ActiveRecord::Base.transaction do
        @entry.update!(kind: "idea")
        EntryLink.create!(parent: into, child: @entry, position: EntryLink.next_position_for(into.id))
      end
      render json: { entry: EntrySerializer.one(@entry, current_user: current_user) }
    end

    # Shallow-duplicate: a new entry with the same attributes and the same
    # children linked (not deep-copied), sitting alongside the original under
    # the same parent(s) so two versions can be compared side by side.
    def fork
      # A fork lands beside the original under every one of its parents, so it writes
      # into each of them. Checked up front rather than inside the transaction: a
      # denial is a 404, not a half-built copy rolled back.
      @entry.parents.each { |parent| authorize parent, :write? }

      new_entry = nil
      ActiveRecord::Base.transaction do
        new_entry = @entry.dup
        new_entry.title = "#{@entry.title} (copy)"
        new_entry.created_by = current_user
        new_entry.archived_at = nil
        new_entry.created_at = nil
        new_entry.updated_at = nil
        new_entry.save!

        @entry.child_links.order(:position).each do |link|
          EntryLink.create!(parent: new_entry, child_id: link.child_id, position: link.position)
        end
        @entry.parent_links.each do |plink|
          EntryLink.create!(parent_id: plink.parent_id, child: new_entry, position: plink.position)
        end
      end
      render json: { entry: EntrySerializer.one(new_entry, current_user: current_user) }, status: :created
    end

    private

    # Two gates, not one: the scope decides whether this id exists as far as the
    # caller is concerned (so an invisible entry is a 404 from find, indistinguishable
    # from a deleted one), and the policy decides whether this particular action is
    # allowed on it.
    def set_entry
      @entry = policy_scope(Entry).find(params[:id])
      authorize @entry
    end

    # pros/cons arrive as the whole array on every write -- there is no
    # add/remove endpoint. The array-of-hashes permits must trail the scalars.
    #
    # kind is create-only: transitions live exclusively in lift/absorb, which set
    # it on the model directly with their own detachment and ownership checks. A
    # kind smuggled into an update would bypass those, and worse -- demoting a
    # trip fires sync_owner_membership's else-branch and wipes every membership.
    def entry_params
      params.require(:entry).permit(
        *(action_name == "create" ? [ :kind ] : []),
        :title, :description, :category, :starts_on, :ends_on,
        :address, :lat, :lng, :duration_minutes, :source_url,
        :notes, :from_entry_id, :to_entry_id,
        pros: [:id, :text], cons: [:id, :text]
      )
    end
  end
end
