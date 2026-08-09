module Api
  class EntryLinksController < Api::BaseController
    before_action :set_parent

    def create
      link = @parent.child_links.new(child_id: params[:child_id], position: params[:position] || next_position)
      if link.save
        render json: { link: EntryLinkSerializer.one(link) }, status: :created
      else
        render json: { errors: link.errors.to_hash(true) }, status: :unprocessable_entity
      end
    end

    def update
      link = @parent.child_links.find_by(child_id: params[:child_id])
      return render json: { error: "Not found" }, status: :not_found unless link

      if link.update(position: params[:position])
        render json: { link: EntryLinkSerializer.one(link) }
      else
        render json: { errors: link.errors.to_hash(true) }, status: :unprocessable_entity
      end
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

    def set_parent
      @parent = Entry.find(params[:entry_id])
    end

    def next_position
      (@parent.child_links.maximum(:position) || -1) + 1
    end
  end
end
