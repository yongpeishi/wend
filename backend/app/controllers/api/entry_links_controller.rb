module Api
  class EntryLinksController < Api::BaseController
    before_action :set_parent

    def create
      # Write on the parent, read on the child. Asymmetric on purpose: this changes
      # what the parent contains and leaves the child alone, and demanding write on
      # the child would block adding something from your own library to a trip --
      # which is the point of the feature.
      authorize Entry.find(params[:child_id]), :show?

      link = @parent.child_links.create!(child_id: params[:child_id],
                                         position: params[:position] || EntryLink.next_position_for(@parent.id))
      render json: { link: EntryLinkSerializer.one(link) }, status: :created
    end

    def update
      link = @parent.child_links.find_by(child_id: params[:child_id])
      return render json: { error: "Not found" }, status: :not_found unless link

      link.update!(position: params[:position])
      render json: { link: EntryLinkSerializer.one(link) }
    end

    def destroy
      @parent.child_links.find_by(child_id: params[:child_id])&.destroy
      head :no_content
    end

    def reorder
      ActiveRecord::Base.transaction do
        Array(params[:child_ids]).each_with_index do |child_id, index|
          @parent.child_links.find_by(child_id: child_id)&.update!(position: index)
        end
      end
      render json: { links: EntryLinkSerializer.list(@parent.child_links.order(:position).to_a) }
    end

    private

    # Every action here rearranges the parent's contents, so write on the parent is
    # the gate for all four. update, destroy and reorder reach their links through
    # `@parent.child_links`, so a child_id that is not already under this parent finds
    # nothing and nothing about it is ever returned -- the child needs no separate
    # check on those three. create is the one that names a new child, and checks it.
    def set_parent
      @parent = Entry.find(params[:entry_id])
      authorize @parent, :write?
    end
  end
end
