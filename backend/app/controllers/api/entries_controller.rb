module Api
  class EntriesController < Api::BaseController
    before_action :set_entry, only: [:show, :update, :destroy, :restore, :tree, :lift, :absorb, :fork]

    def index
      trip_id = params[:trip_id].presence
      scope = Entry.all
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
        scheduled_ids = ScheduleItem.where(trip_id: trip_id)
                                     .where("entry_id IN (:ids) OR chosen_entry_id IN (:ids)", ids: entries.map(&:id).presence || [0])
                                     .pluck(:entry_id, :chosen_entry_id).flatten.compact.to_set
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
        todos: detail["todos"]
      }
    end

    def create
      entry = Entry.new(entry_params)
      entry.created_by = current_user

      ActiveRecord::Base.transaction do
        entry.save!
        if params[:parent_id].present?
          EntryLink.create!(parent_id: params[:parent_id], child: entry, position: next_position(params[:parent_id]))
        end
      end

      render json: { entry: EntrySerializer.one(entry, current_user: current_user) }, status: :created
    rescue ActiveRecord::RecordInvalid => e
      render json: { errors: e.record.errors.to_hash(true) }, status: :unprocessable_entity
    end

    def update
      if @entry.update(entry_params)
        render json: { entry: EntrySerializer.one(@entry, current_user: current_user) }
      else
        render json: { errors: @entry.errors.to_hash(true) }, status: :unprocessable_entity
      end
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
      descendants = Entry.where(id: Entry.descendant_ids_of(@entry.id, depth_cap: depth)).to_a
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
        @entry.update!(kind: "trip", category: nil)
      end
      render json: { entry: EntrySerializer.one(@entry, current_user: current_user) }
    rescue ActiveRecord::RecordInvalid => e
      render json: { errors: e.record.errors.to_hash(true) }, status: :unprocessable_entity
    end

    # Fold this trip into another: it becomes an idea and gains the target as
    # a parent, keeping all of its own descendants.
    def absorb
      into = Entry.find(params[:into_id])
      ActiveRecord::Base.transaction do
        @entry.update!(kind: "idea")
        EntryLink.create!(parent: into, child: @entry, position: next_position(into.id))
      end
      render json: { entry: EntrySerializer.one(@entry, current_user: current_user) }
    rescue ActiveRecord::RecordInvalid => e
      render json: { errors: e.record.errors.to_hash(true) }, status: :unprocessable_entity
    end

    # Shallow-duplicate: a new entry with the same attributes and the same
    # children linked (not deep-copied), sitting alongside the original under
    # the same parent(s) so two versions can be compared side by side.
    def fork
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
    rescue ActiveRecord::RecordInvalid => e
      render json: { errors: e.record.errors.to_hash(true) }, status: :unprocessable_entity
    end

    private

    def set_entry
      @entry = Entry.find(params[:id])
    end

    def next_position(parent_id)
      (EntryLink.where(parent_id: parent_id).maximum(:position) || -1) + 1
    end

    def truthy?(value)
      ActiveModel::Type::Boolean.new.cast(value)
    end

    # pros/cons arrive as the whole array on every write -- there is no
    # add/remove endpoint. The array-of-hashes permits must trail the scalars.
    def entry_params
      params.require(:entry).permit(
        :kind, :title, :description, :category, :starts_on, :ends_on,
        :location_name, :address, :lat, :lng, :duration_minutes, :source_url,
        :notes, :from_entry_id, :to_entry_id,
        pros: [:id, :text], cons: [:id, :text]
      )
    end
  end
end
